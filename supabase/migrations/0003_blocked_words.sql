-- A basic offensive-word list for usernames. Matched as a substring after
-- create_profile drops underscores and folds 0→o 1→i 3→e 4→a 5→s 7→t.
--
-- Short words that sit inside ordinary words are left out on purpose ("ass"
-- in "class", "cum" in "cucumber", "rape" in "grape", "pedo" in "torpedo", "sex" in "sussex",
-- "spic" in "spice"). Substring matching still has false positives
-- (the classic "scunthorpe"); for a study app aimed partly at minors that
-- trade-off is acceptable. This list is a floor, not moderation: see
-- "moderation tooling" under Open in CLAUDE.md.
insert into public.blocked_words (word) values
  ('fuck'), ('fuk'), ('shit'), ('cunt'), ('bitch'), ('whore'), ('slut'),
  ('bastard'), ('asshole'), ('arsehole'), ('dickhead'), ('twat'), ('wank'),
  ('bollock'), ('pussy'), ('penis'), ('vagina'), ('porn'), ('hentai'), ('milf'),
  ('jizz'), ('horny'), ('boob'), ('tits'), ('rapist'), ('molest'), ('pedophil'),
  ('paedophil'), ('nigger'), ('nigga'), ('faggot'), ('retard'), ('tranny'),
  ('dyke'), ('kike'), ('chink'), ('wetback'), ('nazi'), ('hitler'), ('kkk');
