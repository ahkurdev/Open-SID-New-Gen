import { z } from "zod";

export const residentSchema = z.object({
  nik: z.string().regex(/^\d{16}$/, "NIK harus 16 digit angka").optional().nullable().or(z.literal("")),
  name: z.string().min(1, "Nama wajib diisi").max(120),
  gender: z.enum(["L", "P"]),
  birthPlace: z.string().max(120).optional().nullable(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal YYYY-MM-DD").optional().nullable().or(z.literal("")),
  familyId: z.string().uuid().optional().nullable(),
  familyStatus: z.string().max(20).optional().nullable(),
  maritalStatus: z.enum(["belum_kawin", "kawin", "cerai_hidup", "cerai_mati"]).optional().nullable(),
  education: z.string().max(30).optional().nullable(),
  occupation: z.string().max(60).optional().nullable(),
  religion: z.string().max(20).optional().nullable(),
  address: z.string().max(300).optional().nullable(),
  rt: z.string().max(5).optional().nullable(),
  rw: z.string().max(5).optional().nullable(),
  dusunRegionId: z.string().uuid().optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  status: z.enum(["tetap", "tidak_tetap", "pendatang"]).default("tetap"),
});

export const residentUpdateSchema = residentSchema.partial().extend({
  id: z.string().uuid(),
});

export const statusChangeSchema = z.object({
  id: z.string().uuid(),
  eventType: z.enum(["pindah", "meninggal", "datang", "perubahan_kk", "pecah_kk", "gabung_kk"]),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().max(500).optional().nullable(),
  newStatus: z.enum(["pindah", "meninggal", "tetap", "pendatang", "tidak_tetap"]),
  deathDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

export const familySchema = z.object({
  kkNumber: z.string().regex(/^\d{16}$/, "No. KK harus 16 digit angka").optional().nullable().or(z.literal("")),
  address: z.string().max(300).optional().nullable(),
  rt: z.string().max(5).optional().nullable(),
  rw: z.string().max(5).optional().nullable(),
  dusunRegionId: z.string().uuid().optional().nullable(),
});

export const familyUpdateSchema = familySchema.partial().extend({ id: z.string().uuid() });
