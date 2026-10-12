-- ============================================================
-- Migration V6 — PIN pour Admin/Qualité (table validateurs)
-- ============================================================

alter table parametres_validateurs add column if not exists pin text;
