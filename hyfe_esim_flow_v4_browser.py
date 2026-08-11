#!/usr/bin/env python3
"""
HYFE eSIM Trial flow helper.

This script performs the HTTP flow described by the user with a single
requests.Session. It is intentionally human-in-the-loop for consent, OTP,
CAPTCHA, and the final submit. It does not solve, bypass, harvest, or fabricate
CAPTCHA tokens.

Use only for your own data and an authorized registration. The endpoints and
response schema are controlled by the service and may change without notice.
"""

from __future__ import annotations

import argparse
import getpass
import json
import os
import re
import secrets
import shutil
import subprocess
import sys
import tempfile
import uuid
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable

try:
    import requests
except ImportError:  # pragma: no cover
    print("Dependency missing. Install it with: python3 -m pip install requests", file=sys.stderr)
    raise SystemExit(2)


DEFAULT_BASE = "https://prioritas.xl.co.id"
DEFAULT_API = "https://jupiter-ms-webprio-v2.ext.dp.xl.co.id"
DEFAULT_PAGE = "/hyfe-apply/esim-trial"
DEFAULT_CHANNEL_ID = "7c93208a-6a17-462d-933b-73492818ce01"


class FlowError(RuntimeError):
    """Expected flow failure with a user-safe message."""


@dataclass
class NumberCandidate:
    encrypted: str
    label: str


def compact_json(value: Any, limit: int = 1200) -> str:
    try:
        text = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    except TypeError:
        text = repr(value)
    return text if len(text) <= limit else text[:limit] + "..."


def safe_excerpt(text: str, limit: int = 500) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    return text if len(text) <= limit else text[:limit] + "..."


def mask_email(value: str) -> str:
    local, sep, domain = value.partition("@")
    if not sep:
        return "***"
    shown = local[:2] if len(local) > 2 else local[:1]
    return f"{shown}***@{domain}"


def mask_tail(value: str, keep: int = 4) -> str:
    return "*" * max(0, len(value) - keep) + value[-keep:]


def secret_input(prompt: str) -> str:
    return getpass.getpass(prompt).strip()


def captcha_token_file_input(workdir: Path) -> str:
    """Collect a long CAPTCHA response through a protected temporary text
    file instead of the terminal's one-line TTY input buffer.

    The user manually obtains the token in the official browser, pastes it
    into TextEdit, saves it, then explicitly confirms with a short terminal
    command. The file is deleted immediately after it is read.
    """
    token_path = workdir / "captcha-token.txt"
    token_path.write_text("", encoding="utf-8")
    os.chmod(token_path, 0o600)

    print(
        "\nToken CAPTCHA terlalu panjang untuk sebagian terminal macOS, jadi "
        "token tidak akan ditempel di terminal."
    )
    if sys.platform == "darwin":
        try:
            subprocess.run(["open", "-e", str(token_path)], check=True)
        except (OSError, subprocess.SubprocessError) as exc:
            print(f"Peringatan: TextEdit tidak dapat dibuka otomatis: {exc}")
    print(
        f"Tempel token CAPTCHA baru secara manual ke file berikut, simpan, lalu "
        f"kembali ke terminal:\n  {token_path}\n"
        "Catatan: file ini hanya bisa dibaca oleh akun Anda dan akan dihapus "
        "oleh skrip setelah dibaca."
    )
    if input("Setelah file disimpan, ketik LANJUT: ").strip() != "LANJUT":
        raise FlowError("Dibatalkan sebelum membaca token CAPTCHA dari file.")

    try:
        # Remove whitespace/newlines introduced by the text editor, but leave
        # every non-whitespace character in the official token unchanged.
        return re.sub(r"\s+", "", token_path.read_text(encoding="utf-8"))
    except OSError as exc:
        raise FlowError(f"Token CAPTCHA tidak dapat dibaca dari file: {exc}") from exc
    finally:
        try:
            token_path.unlink()
        except FileNotFoundError:
            pass


def dig(obj: Any, path: Iterable[str]) -> Any:
    current = obj
    for key in path:
        if not isinstance(current, dict) or key not in current:
            return None
        current = current[key]
    return current


def first_value(obj: Any, *paths: tuple[str, ...]) -> Any:
    for path in paths:
        value = dig(obj, path)
        if value not in (None, "", [], {}):
            return value
    return None


def get_cookie(session: requests.Session, name: str) -> str | None:
    values = [cookie.value for cookie in session.cookies if cookie.name == name]
    return values[-1] if values else None


def find_number_candidates(obj: Any) -> list[NumberCandidate]:
    candidates: list[NumberCandidate] = []
    seen: set[str] = set()
    display_keys = (
        "msisdn",
        "number",
        "niceNumber",
        "resourceValue",
        "telephoneNumber",
        "displayNumber",
        "value",
    )

    def walk(value: Any) -> None:
        if isinstance(value, dict):
            encrypted = value.get("encrypt")
            if isinstance(encrypted, str) and encrypted and encrypted not in seen:
                label = next(
                    (
                        str(value[key])
                        for key in display_keys
                        if key in value and value[key] not in (None, "")
                    ),
                    "nomor tanpa label",
                )
                candidates.append(NumberCandidate(encrypted=encrypted, label=label))
                seen.add(encrypted)
            for child in value.values():
                walk(child)
        elif isinstance(value, list):
            for child in value:
                walk(child)

    walk(obj)
    return candidates


def validate_email(value: str) -> bool:
    return bool(re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value))


def validate_whatsapp(value: str) -> bool:
    return bool(re.fullmatch(r"8\d{8,}", value))


def validate_eid(value: str) -> bool:
    return bool(re.fullmatch(r"\d{32}", value))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Run the HYFE eSIM Trial HTTP flow with manual consent, OTP, "
            "CAPTCHA, and final confirmation."
        )
    )
    parser.add_argument("--base", default=DEFAULT_BASE, help="Frontend origin")
    parser.add_argument("--api", default=DEFAULT_API, help="API origin")
    parser.add_argument("--prefix", default="6281", help="Nice-number prefix")
    parser.add_argument("--pattern", default="12345", help="Favorite digits, max 5")
    parser.add_argument("--page-size", type=int, default=40, help="Search result page size")
    parser.add_argument(
        "--keep-artifacts",
        action="store_true",
        help="Keep raw responses and payloads. They may contain sensitive data.",
    )
    return parser.parse_args()


class HyfeFlow:
    def __init__(self, args: argparse.Namespace, workdir: Path) -> None:
        self.args = args
        self.base = args.base.rstrip("/")
        self.api = args.api.rstrip("/")
        self.page_url = self.base + DEFAULT_PAGE
        self.workdir = workdir
        self.request_id = str(uuid.uuid4())
        self.session = requests.Session()
        self.session.headers.update(
            {
                "User-Agent": (
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/150.0.0.0 Safari/537.36"
                ),
                "Accept": "application/json, text/plain, */*",
                "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
                "Cache-Control": "no-store, no-cache, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0",
            }
        )

    def save_text(self, name: str, text: str) -> None:
        path = self.workdir / name
        path.write_text(text, encoding="utf-8")
        os.chmod(path, 0o600)

    def save_json(self, name: str, value: Any) -> None:
        path = self.workdir / name
        path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
        os.chmod(path, 0o600)

    def api_headers(
        self,
        *,
        bearer_token: str | None = None,
        raw_authorization: str | None = None,
        csrf_token: str | None = None,
        tnc_token: str | None = None,
    ) -> dict[str, str]:
        headers = {
            "Origin": self.base,
            "Referer": self.page_url,
            "requestid": self.request_id,
        }
        if bearer_token:
            headers["Authorization"] = f"Bearer {bearer_token}"
        if raw_authorization:
            headers["Authorization"] = raw_authorization
        if csrf_token:
            headers["X-CSRF-Token"] = csrf_token
        if tnc_token:
            headers["tokentnc"] = tnc_token
        return headers

    def request(
        self,
        method: str,
        url: str,
        *,
        artifact_name: str,
        expect_json: bool = True,
        final_submit: bool = False,
        allowed_statuses: set[int] | None = None,
        **kwargs: Any,
    ) -> tuple[requests.Response, Any | None]:
        timeout = (10, 60 if final_submit else 30)
        try:
            response = self.session.request(method, url, timeout=timeout, **kwargs)
        except requests.Timeout as exc:
            if final_submit:
                raise FlowError(
                    "Submit final timeout. Script tidak melakukan retry otomatis. "
                    "Jangan langsung mengulang karena status transaksi mungkin sudah diproses."
                ) from exc
            raise FlowError(f"Request timeout pada {url}") from exc
        except requests.RequestException as exc:
            raise FlowError(f"Request gagal pada {url}: {exc}") from exc

        self.save_text(artifact_name, response.text)

        allowed_statuses = allowed_statuses or set()
        if not 200 <= response.status_code < 300 and response.status_code not in allowed_statuses:
            raise FlowError(
                f"HTTP {response.status_code} dari {url}. "
                f"Cuplikan respons: {safe_excerpt(response.text)}"
            )

        if not expect_json:
            return response, None

        try:
            data = response.json()
        except ValueError as exc:
            content_type = response.headers.get("Content-Type", "tidak diketahui")
            raise FlowError(
                f"Respons dari {url} bukan JSON (Content-Type: {content_type}). "
                f"Cuplikan: {safe_excerpt(response.text)}"
            ) from exc
        return response, data

    def bootstrap(self) -> tuple[str, str]:
        print("[1/8] Membuka halaman dan membuat session...")
        self.request(
            "GET",
            self.page_url,
            artifact_name="01-page.html",
            expect_json=False,
            allow_redirects=True,
            headers={"Accept": "text/html,application/xhtml+xml"},
        )

        self.request(
            "POST",
            f"{self.base}/hyfe-apply/api/auth",
            artifact_name="02-auth-response.txt",
            expect_json=False,
            allow_redirects=False,
            headers={"Origin": self.base, "Referer": self.page_url},
        )

        token = get_cookie(self.session, "token")
        if not token:
            cookie_names = sorted({cookie.name for cookie in self.session.cookies})
            raise FlowError(
                "Cookie 'token' tidak ditemukan setelah bootstrap auth. "
                f"Cookie yang tersedia: {cookie_names or 'tidak ada'}. "
                "Periksa artefak auth bila memakai --keep-artifacts."
            )

        print("[2/8] Mengambil CSRF token...")
        _, session_data = self.request(
            "GET",
            f"{self.api}/hyfe/v1/session",
            artifact_name="03-session-response.json",
            headers=self.api_headers(bearer_token=token),
        )
        csrf = first_value(
            session_data,
            ("result", "csrfToken"),
            ("result", "data", "csrfToken"),
            ("csrfToken",),
        )
        if not isinstance(csrf, str) or not csrf:
            raise FlowError(
                "CSRF token tidak ditemukan pada respons session. "
                f"Struktur ringkas: {compact_json(session_data)}"
            )
        return token, csrf

    def choose_number(self, token: str, csrf: str) -> str:
        pattern = self.args.pattern.strip()
        if pattern and not re.fullmatch(r"\d{1,5}", pattern):
            raise FlowError("--pattern harus kosong atau berisi 1 sampai 5 digit angka.")
        if not re.fullmatch(r"\d+", self.args.prefix):
            raise FlowError("--prefix harus berisi angka.")

        print("[3/8] Mencari nomor HYFE...")
        attempt = 0
        random_failures = 0

        while True:
            attempt += 1
            body_page = 1 if pattern else secrets.randbelow(496) + 5
            payload = {
                "prefixNiceNumber": self.args.prefix,
                "pattern": pattern,
                "minPrice": "0",
                "maxPrice": "0",
                "count": "1",
                "channel": "webprio",
                "otp": "",
                "operatorId": "webuser-thread01",
                "pageNo": body_page,
                "pageSize": self.args.page_size,
                "suggestion": False,
            }
            self.save_json(f"04-find-number-payload-{attempt}.json", payload)
            response, result = self.request(
                "POST",
                f"{self.api}/hyfe/v1/msisdn/findResources?page=1",
                artifact_name=f"05-find-number-response-{attempt}.json",
                headers={
                    **self.api_headers(bearer_token=token, csrf_token=csrf),
                    "Content-Type": "application/json",
                },
                json=payload,
                allowed_statuses={404},
            )

            status_code = result.get("statusCode") if isinstance(result, dict) else None
            error_code = first_value(result, ("result", "errorCode"))
            no_match = (
                response.status_code == 404
                and str(status_code) == "404"
                and str(error_code) == "10"
            )
            if response.status_code == 404 and not no_match:
                raise FlowError(
                    "Endpoint pencarian mengembalikan HTTP 404 yang tidak dikenali. "
                    f"Cuplikan respons: {safe_excerpt(response.text)}"
                )

            candidates = [] if no_match else find_number_candidates(result)
            if candidates:
                print("Nomor yang ditemukan:")
                for index, candidate in enumerate(candidates, start=1):
                    print(f"  {index}. {candidate.label}")

                while True:
                    choice = input(f"Pilih nomor [1-{len(candidates)}]: ").strip()
                    if choice.isdigit() and 1 <= int(choice) <= len(candidates):
                        return candidates[int(choice) - 1].encrypted
                    print("Pilihan tidak valid.")

            if pattern:
                print(f"Tidak ada nomor tersedia yang cocok dengan pola '{pattern}'.")
            else:
                random_failures += 1
                print(
                    "Belum menemukan nomor pada kelompok inventori acak "
                    f"(pageNo={body_page})."
                )
                if random_failures < 3:
                    print("Mencoba kelompok inventori acak lain...")
                    continue

            while True:
                replacement = input(
                    "Masukkan pola lain 1-5 digit, tekan Enter untuk nomor acak, "
                    "atau ketik q untuk batal: "
                ).strip()
                if replacement.lower() == "q":
                    raise FlowError("Dibatalkan karena tidak ada nomor yang dipilih.")
                if replacement == "":
                    pattern = ""
                    random_failures = 0
                    break
                if re.fullmatch(r"\d{1,5}", replacement):
                    pattern = replacement
                    random_failures = 0
                    break
                print("Pola harus terdiri dari 1 sampai 5 digit angka.")

    def collect_identity(self) -> tuple[str, str, str, str]:
        print("[4/8] Memasukkan data pelanggan secara lokal...")
        full_name = input("Nama lengkap: ").strip()
        whatsapp = input("WhatsApp tanpa 0 atau +62, contoh 81212345678: ").strip()
        email = input("Email: ").strip()
        eid = input("EID 32 digit: ").strip()

        if not full_name:
            raise FlowError("Nama lengkap tidak boleh kosong.")
        if not validate_whatsapp(whatsapp):
            raise FlowError("WhatsApp harus diawali 8 dan minimal 9 digit angka.")
        if not validate_email(email):
            raise FlowError("Format email tidak valid.")
        if not validate_eid(eid):
            raise FlowError("EID harus tepat 32 digit angka.")
        return full_name, whatsapp, email, eid

    def create_consent(self, token: str, csrf: str, email: str) -> tuple[str, str]:
        print("[5/8] Memproses TNC dan consent...")
        print(
            "Tahap ini dapat mencatat persetujuan TNC/opt-in pada layanan resmi. "
            "Lanjutkan hanya bila Anda memahami dan menyetujuinya."
        )
        if input("Ketik SETUJU untuk melanjutkan: ").strip() != "SETUJU":
            raise FlowError("Dibatalkan sebelum pencatatan consent.")

        _, tnc_data = self.request(
            "POST",
            f"{self.api}/comet/v1/tnc/tncToken",
            artifact_name="06-tnc-token-response.json",
            headers={
                **self.api_headers(bearer_token=token, csrf_token=csrf),
                "Content-Type": "application/json",
            },
        )
        tnc_token = first_value(
            tnc_data,
            ("result", "data", "access_token"),
            ("data", "access_token"),
        )
        if not isinstance(tnc_token, str) or not tnc_token:
            raise FlowError(
                "TNC access token tidak ditemukan. "
                f"Struktur ringkas: {compact_json(tnc_data)}"
            )

        payload = {
            "type": "email",
            "channelId": DEFAULT_CHANNEL_ID,
            "msisdn": email,
            "status": 2,
        }
        self.save_json("07-opt-in-payload.json", payload)
        _, optin_data = self.request(
            "POST",
            f"{self.api}/comet/v1/tnc/optIn",
            artifact_name="08-opt-in-response.json",
            headers={
                **self.api_headers(raw_authorization=tnc_token, csrf_token=csrf),
                "Content-Type": "application/json",
            },
            json=payload,
        )
        consent_id = first_value(
            optin_data,
            ("result", "data", "consentId"),
            ("data", "consentId"),
        )
        if not isinstance(consent_id, str) or not consent_id:
            raise FlowError(
                "consentId tidak ditemukan. "
                f"Struktur ringkas: {compact_json(optin_data)}"
            )
        return tnc_token, consent_id

    def send_otp(self, token: str, csrf: str, email: str, full_name: str) -> None:
        print("[6/8] Menyiapkan pengiriman OTP...")
        print(f"OTP akan dikirim ke {mask_email(email)}.")
        if input("Ketik KIRIM untuk mengirim OTP: ").strip() != "KIRIM":
            raise FlowError("Dibatalkan sebelum pengiriman OTP.")

        # The current API schema accepts only email and name here.
        # Sending a custom title is rejected with errorCode 15:
        # `"title" is not allowed`.
        payload = {
            "email": email,
            "name": full_name,
        }
        self.save_json("09-send-otp-payload.json", payload)
        self.request(
            "POST",
            f"{self.api}/hyfe/v1/esim/freeTrial/send-otp",
            artifact_name="10-send-otp-response.json",
            headers={
                **self.api_headers(bearer_token=token, csrf_token=csrf),
                "Content-Type": "application/json",
            },
            json=payload,
        )
        print("Permintaan OTP berhasil dikirim menurut respons HTTP.")

    def final_submit(
        self,
        *,
        token: str,
        csrf: str,
        tnc_token: str,
        consent_id: str,
        encrypted_msisdn: str,
        full_name: str,
        whatsapp: str,
        email: str,
        eid: str,
    ) -> Any:
        print("[7/8] Menunggu OTP dan CAPTCHA resmi...")
        print(
            "Script ini tidak membuat, memecahkan, memanen, atau membypass CAPTCHA. "
            "Masukkan hanya token sah dari reCAPTCHA resmi. Token bisa ditolak bila "
            "session browser tidak cocok dengan session HTTP ini."
        )
        otp = input("OTP email 6 digit: ").strip()
        print(f"Input OTP diterima oleh terminal ({len(otp)} karakter); belum divalidasi server.")

        captcha = captcha_token_file_input(self.workdir)
        print(
            f"Input CAPTCHA diterima oleh terminal ({len(captcha)} karakter); "
            "belum divalidasi server."
        )

        if not re.fullmatch(r"[A-Za-z0-9]{6}", otp):
            raise FlowError("OTP harus tepat 6 karakter alfanumerik (huruf atau angka).")
        if not captcha:
            raise FlowError("Token CAPTCHA tidak boleh kosong.")
        if len(captcha) < 100:
            print(
                "PERINGATAN: nilai CAPTCHA terlihat sangat pendek. "
                "Server kemungkinan akan menolaknya."
            )

        payload = {
            "token": captcha,
            "otpCode": otp,
            "consentId": consent_id,
            "msisdn": encrypted_msisdn,
            "eid": eid,
            "channel": "EVENT",
            "customerInfo": {
                "title": "Sdr.",
                "firstName": full_name,
                "middleName": "",
                "lastName": "",
                "contactNumber": f"62{whatsapp}",
                "email": email,
            },
        }
        self.save_json("11-final-submit-payload.json", payload)

        print("\nRingkasan final:")
        print(f"  Nama      : {full_name}")
        print(f"  WhatsApp  : +62{mask_tail(whatsapp)}")
        print(f"  Email     : {mask_email(email)}")
        print(f"  EID       : {mask_tail(eid, 6)}")
        print("  Tindakan  : registrasi/aktivasi eSIM Trial HYFE")
        print(
            "Submit final dapat memiliki efek nyata. Script tidak akan melakukan retry "
            "otomatis apabila timeout atau hasilnya ambigu."
        )
        if input("Ketik SUBMIT untuk menjalankan sekali: ").strip() != "SUBMIT":
            raise FlowError("Dibatalkan sebelum submit final.")

        print("[8/8] Mengirim submit final satu kali...")
        print(
            "Menunggu respons server (batas baca 60 detik). "
            "Jangan tekan Enter atau menjalankan ulang selama proses ini."
        )
        sys.stdout.flush()
        response, result = self.request(
            "POST",
            f"{self.api}/hyfe/v1/esim/freeTrial/validateAndSubmit",
            artifact_name="12-final-submit-response.json",
            final_submit=True,
            headers={
                **self.api_headers(
                    bearer_token=token,
                    csrf_token=csrf,
                    tnc_token=tnc_token,
                ),
                "Content-Type": "application/json",
            },
            json=payload,
        )
        print(f"Server merespons HTTP {response.status_code}.")
        return result


def summarize_final(result: Any) -> dict[str, Any]:
    if not isinstance(result, dict):
        return {"rawType": type(result).__name__}
    return {
        "statusCode": result.get("statusCode"),
        "resultCode": first_value(
            result,
            ("result", "data", "result", "resultCode"),
            ("result", "data", "resultCode"),
        ),
        "message": first_value(
            result,
            ("result", "data", "message"),
            ("result", "message"),
            ("message",),
        ),
    }


def main() -> int:
    args = parse_args()
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    workdir = Path(tempfile.mkdtemp(prefix=f"hyfe-run-{timestamp}-"))
    os.chmod(workdir, 0o700)

    print("Gunakan hanya untuk data Anda sendiri dan proses yang Anda berwenang lakukan.")
    print(f"REQUEST_ID akan dibuat baru untuk sesi ini.")

    flow = HyfeFlow(args, workdir)
    print(f"REQUEST_ID={flow.request_id}")

    try:
        token, csrf = flow.bootstrap()
        encrypted_msisdn = flow.choose_number(token, csrf)
        full_name, whatsapp, email, eid = flow.collect_identity()
        tnc_token, consent_id = flow.create_consent(token, csrf, email)
        flow.send_otp(token, csrf, email, full_name)
        result = flow.final_submit(
            token=token,
            csrf=csrf,
            tnc_token=tnc_token,
            consent_id=consent_id,
            encrypted_msisdn=encrypted_msisdn,
            full_name=full_name,
            whatsapp=whatsapp,
            email=email,
            eid=eid,
        )
        print("\nRespons final ringkas:")
        print(json.dumps(summarize_final(result), ensure_ascii=False, indent=2))
        return 0
    except KeyboardInterrupt:
        print("\nDibatalkan oleh pengguna.", file=sys.stderr)
        return 130
    except FlowError as exc:
        print(f"\nGagal: {exc}", file=sys.stderr)
        return 1
    finally:
        flow.session.close()
        if args.keep_artifacts:
            print(
                f"Artefak disimpan di: {workdir}\n"
                "PERINGATAN: folder dapat berisi token, cookie, OTP payload, EID, dan data pribadi."
            )
        else:
            shutil.rmtree(workdir, ignore_errors=True)
            print("Artefak sementara telah dihapus.")


if __name__ == "__main__":
    raise SystemExit(main())
