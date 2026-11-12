'use strict';

const DEFAULT_IKANOTITA = 'Ι1';
const DEFAULT_POSTO = 'ΑΠΛΟΣ';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS stratiotes (
    asm TEXT PRIMARY KEY,
    onoma TEXT,
    eponymo TEXT,
    monada TEXT,
    xreostoumena INTEGER DEFAULT 0,
    mina_ypiresion INTEGER DEFAULT 0,
    posto TEXT DEFAULT '${DEFAULT_POSTO}',
    ikanotita TEXT DEFAULT '${DEFAULT_IKANOTITA}',
    energos INTEGER DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS kolymata (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stratiotis_asm TEXT,
    imerominia TEXT,
    typos TEXT,
    FOREIGN KEY (stratiotis_asm) REFERENCES stratiotes (asm) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS ypiresies (
    imerominia TEXT PRIMARY KEY,
    th1_main TEXT, th1_backup TEXT,
    th2_main TEXT, th2_backup TEXT,
    th3_main TEXT, th3_backup TEXT,
    sk1K_main TEXT, sk1K_backup TEXT,
    sk1F_main TEXT, sk1F_backup TEXT,
    sk2K_main TEXT, sk2K_backup TEXT,
    sk2F_main TEXT, sk2F_backup TEXT,
    sk3K_main TEXT, sk3K_backup TEXT,
    sk3F_main TEXT, sk3F_backup TEXT
  );
`;

function openDb(filePath) {
  const Database = require('better-sqlite3');
  return new Database(filePath);
}

function createDbManager(db, { foreignKeys = true } = {}) {
  function initDb() {
    db.exec(`PRAGMA foreign_keys = ${foreignKeys ? 'ON' : 'OFF'}`);
    db.exec(SCHEMA);
  }

  function getAllStratiotes() {
    return db.prepare(
      'SELECT asm, onoma, eponymo, monada, xreostoumena, mina_ypiresion, posto, ikanotita FROM stratiotes WHERE energos = 1'
    ).all().map((row) => ({ ...row }));
  }

  function addStratiotis(asm, onoma, eponymo, monada, ikanotita = DEFAULT_IKANOTITA) {
    db.prepare(
      `INSERT INTO stratiotes (asm, onoma, eponymo, monada, ikanotita, posto) VALUES (?, ?, ?, ?, ?, '${DEFAULT_POSTO}')`
    ).run(asm, onoma, eponymo, monada, ikanotita);
  }

  function updateStratiotis(asm, onoma, eponymo, monada, posto, ikanotita) {
    db.prepare(
      'UPDATE stratiotes SET onoma = ?, eponymo = ?, monada = ?, posto = ?, ikanotita = ? WHERE asm = ?'
    ).run(onoma, eponymo, monada, posto, ikanotita, asm);
  }

  function deleteStratiotis(asm) {
    db.prepare('DELETE FROM stratiotes WHERE asm = ?').run(asm);
  }

  function addAdeia(asm, imerominia, typos) {
    db.prepare('INSERT INTO kolymata (stratiotis_asm, imerominia, typos) VALUES (?, ?, ?)')
      .run(asm, imerominia, typos);
  }

  return { initDb, getAllStratiotes, addStratiotis, updateStratiotis, deleteStratiotis, addAdeia };
}

module.exports = { createDbManager, openDb, DEFAULT_IKANOTITA, DEFAULT_POSTO };
