import { z } from 'zod';

export const identitySchema = z.object({
  fullName: z.string().trim().min(1, 'Nama lengkap wajib diisi.'),
  whatsapp: z.string().trim().regex(/^8\d{8,}$/, 'WhatsApp harus diawali 8 dan minimal 9 digit.'),
  email: z.string().trim().email('Format email tidak valid.'),
  eid: z.string().trim().regex(/^\d{32}$/, 'EID harus tepat 32 digit.'),
});

export const numberSearchSchema = z.object({
  prefix: z.string().trim().regex(/^\d+$/, 'Prefix harus berisi angka.'),
  pattern: z.string().trim().regex(/^\d{0,5}$/, 'Pola harus kosong atau terdiri dari 1 sampai 5 digit.'),
  pageSize: z.number().int().min(1).max(100),
});

export const consentSchema = z.object({
  email: z.string().trim().email('Format email tidak valid.'),
  confirmed: z.literal(true, {
    errorMap: () => ({ message: 'Persetujuan harus dikonfirmasi terlebih dahulu.' }),
  }),
});

export const otpRequestSchema = z.object({
  email: z.string().trim().email('Format email tidak valid.'),
  fullName: z.string().trim().min(1, 'Nama lengkap wajib diisi.'),
});

export const otpSchema = z.object({
  otp: z.string().trim().regex(/^[A-Za-z0-9]{6}$/, 'OTP harus tepat 6 karakter alfanumerik.'),
  captcha: z.string().trim().min(1, 'Respons CAPTCHA wajib diisi secara manual.'),
});

export const finalSubmitSchema = identitySchema.merge(otpSchema).extend({
  confirmed: z.literal(true, {
    errorMap: () => ({ message: 'Konfirmasi submit final wajib dicentang.' }),
  }),
});

export const selectionSchema = z.object({
  selectionId: z.string().uuid('Pilihan nomor tidak valid.'),
});

export function formatZodIssues(issues: z.ZodIssue[]): string {
  return issues.map((issue) => issue.message).join(' ');
}
