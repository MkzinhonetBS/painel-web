const express = require('express');
const fs = require('fs');
const path = require('path');
const session = require('express-session');

const db = require('./db');

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ================= EJS =================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ================= SESSION =================
app.use(
  session({
    store: new SQLiteStore({
      db: 'sessions.db',
      dir: './'
    }),
    secret: 'painel-super-secreto-123',
    resave: false,
    saveUninitialized: false
  })
);

// ================= CONFIG =================
const LOG = 'logins.txt';

// ================= MIDDLEWARE =================
function proteger(req, res, next) {
  if (!req.session.logado) {
    return res.redirect('/');
  }
  next();
}

// ================= LOGIN =================
app.post('/login', (req, res) => {
  const { usuario, senha, key } = req.body;

  db.get(
    `SELECT * FROM users WHERE usuario = ? AND senha = ? AND key = ?`,
    [usuario, senha, key],
    (err, user) => {
      if (!user) {
        return res.sendFile(path.join(__dirname, 'public', 'erro.html'));
      }

      db.get(
        `SELECT * FROM keys WHERE key = ?`,
        [key],
        (err, keyRow) => {
          if (!keyRow || keyRow.ativo !== 1) {
            return res.sendFile(path.join(__dirname, 'public', 'erro.html'));
          }

          req.session.logado = true;
          req.session.usuario = usuario;
          req.session.tipo = keyRow.tipo;

          const log = `${usuario} (${keyRow.tipo}) - ${new Date().toLocaleString()}\n`;
          fs.appendFileSync(LOG, log);

          if (keyRow.tipo === 'master') {
            return res.redirect('/admin');
          }

          res.redirect('/painel');
        }
      );
    }
  );
});

// ================= REGISTRO =================
app.post('/register', (req, res) => {
  const { key, usuario, senha } = req.body;

  if (!key || !usuario || !senha) {
    return res.send('Preencha todos os campos');
  }

  db.get(
    `SELECT * FROM keys WHERE key = ? AND ativo = 1`,
    [key],
    (err, keyRow) => {
      if (!keyRow) {
        return res.send('Key inválida ou desativada');
      }

      db.run(
        `INSERT INTO users (usuario, senha, key, tipo)
         VALUES (?, ?, ?, ?)`,
        [usuario, senha, key, keyRow.tipo],
        err => {
          if (err) {
            return res.send('Usuário já existe');
          }

          if (keyRow.tipo !== 'master') {
            db.run(`UPDATE keys SET ativo = 0 WHERE key = ?`, [key]);
          }

          res.redirect('/');
        }
      );
    }
  );
});

// ================= PAINEL NORMAL =================
app.get('/painel', proteger, (req, res) => {
  res.send(`
    <h2>Painel Principal</h2>
    <p>👤 ${req.session.usuario}</p>
    <p>${req.session.tipo === 'master' ? '🔑 Administrador' : '👥 Usuário'}</p>
    <a href="/logout">Sair</a>
  `);
});

// ================= ADMIN =================
app.get('/admin', proteger, (req, res) => {
  if (req.session.tipo !== 'master') {
    return res.send('Acesso negado');
  }

  db.get(`SELECT COUNT(*) AS total FROM users`, (err, u) => {
    db.get(`SELECT COUNT(*) AS total FROM keys WHERE ativo = 1`, (err, k) => {
      res.render('admin', {
        usuario: req.session.usuario,
        totalUsers: u.total,
        totalKeys: k.total
      });
    });
  });
});

// ================= ADMIN USERS =================
app.get('/admin/users', proteger, (req, res) => {
  if (req.session.tipo !== 'master') {
    return res.send('Acesso negado');
  }

  db.all(`SELECT usuario, tipo FROM users`, (err, users) => {
    res.render('admin-users', {
      usuario: req.session.usuario,
      users
    });
  });
});

// ================= ADMIN KEYS =================
app.get('/admin/keys', proteger, (req, res) => {
  if (req.session.tipo !== 'master') {
    return res.send('Acesso negado');
  }

  db.all(`
    SELECT 
      keys.id,
      keys.key,
      keys.owner,
      keys.tipo,
      keys.ativo,
      users.usuario AS usuario_usando
    FROM keys
    LEFT JOIN users ON users."key" = keys.key
  `, (err, keys) => {
    if (err) {
      console.error('ERRO SQL:', err);
      return res.send('Erro ao carregar keys');
    }

    res.render('admin-keys', {
      usuario: req.session.usuario,
      keys
    });
  });
});


// ================= GERAR KEY =================
app.post('/gerar-key', proteger, (req, res) => {
  if (req.session.tipo !== 'master') {
    return res.send('Acesso negado');
  }

  const { owner } = req.body;

  const novaKey =
    'KEY-' +
    Math.random().toString(36).substr(2, 4).toUpperCase() +
    '-' +
    Math.random().toString(36).substr(2, 3).toUpperCase();

  db.run(
    `INSERT INTO keys (key, owner, tipo, ativo)
     VALUES (?, ?, 'user', 1)`,
    [novaKey, owner],
    () => {
      res.redirect('/admin/keys');
    }
  );
});

// ================= DESATIVAR KEY =================
app.post('/admin/keys/desativar/:id', proteger, (req, res) => {
  if (req.session.tipo !== 'master') {
    return res.send('Acesso negado');
  }

  db.run(
    `UPDATE keys SET ativo = 0 WHERE id = ?`,
    [req.params.id],
    () => {
      res.redirect('/admin/keys');
    }
  );
});

// ================= DELETAR KEY =================
app.post('/admin/keys/deletar/:id', proteger, (req, res) => {
  if (req.session.tipo !== 'master') {
    return res.send('Acesso negado');
  }

  db.run(
    `DELETE FROM keys WHERE id = ?`,
    [req.params.id],
    () => {
      res.redirect('/admin/keys');
    }
  );
});

// ================= LOGOUT =================
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// ================= SERVIDOR =================
app.listen(3000, () => {
  console.log('🔥 Servidor rodando em http://localhost:3000');
});
