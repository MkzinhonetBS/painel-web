const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./database.db');

db.serialize(() => {
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario TEXT UNIQUE,
    senha TEXT,
    key TEXT,
    tipo TEXT
  )
`);

  db.get(`SELECT * FROM keys WHERE tipo = 'master'`, (err, row) => {
    if (!row) {
      db.run(`
        INSERT INTO keys (key, owner, tipo, ativo)
        VALUES ('MKZ-ADMIN-999', 'criador', 'master', 1)
      `);
      console.log('KEY MASTER criada');
    }
  });
});

module.exports = db;
