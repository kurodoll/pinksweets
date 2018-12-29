const express = require('express');
const router = express.Router();


// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
// *                                                          * // App Init //
const website_name = 'pinksweets';

try {
  config = require('../config');
}
catch (e) {
  console.warn('No config file found.');
}

let boards = [];


// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
// *                                                           * // DB Init //
const pg = require('pg');
const url = require('url');

let db_url;
let pg_pool;

if (process.env.DATABASE_URL) {
  db_url = process.env.DATABASE_URL;
}
else {
  db_url = config.db.url;
}

if (db_url) {
  const params = url.parse(db_url);
  const auth = params.auth.split(':');

  const pg_config = {
    host: params.hostname,
    port: params.port,
    user: auth[0],
    password: auth[1],
    database: params.pathname.split('/')[1],
    ssl: true,
    max: 10,
    idleTimeoutMillis: 30000 };

  pg_pool = new pg.Pool(pg_config);
}
else {
  console.error('Couldn\'t connect to database as no config could be loaded.');
}

pg_pool.on('error', function(err, client) {
  console.error('Idle client error: ', err.message, err.stack);
});


// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
// *                                                 * // General Functions //
function getTimestamp() {
  return new Date(new Date().getTime()).toISOString();
}


// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
// *                                                           * // Routing //
router.get('/', function(req, res, next) {
  pg_pool.query('SELECT * FROM boards;', (err, result) => {
    if (err) {
      console.error(err);
    }
    else {
      boards = result.rows;
    }

    res.render('index', { title: website_name, boards: result.rows });
  });
});

router.get('/:board', function(req, res, next) {
  const query = 'SELECT * FROM posts WHERE board = $1;';
  const vars = [ req.params.board ];

  pg_pool.query(query, vars, (err, result) => {
    if (err) {
      console.error(err);
    }

    res.render('board', {
      title: req.params.board + ' - ' + website_name,
      boards: boards,
      board: req.params.board,
      posts: result.rows });
  });
});

router.post('/new_post', function(req, res, next) {
  if (!req.body.text) {
    res.redirect('/' + req.body.board);
  }
  else {
    const query = 'INSERT INTO posts (board, poster, text, image_url, time_stamp) VALUES ($1, $2, $3, $4, $5);'; // eslint-disable-line max-len
    const vars = [
      req.body.board,
      req.body.username || null,
      req.body.text,
      req.body.image_url || null,
      getTimestamp() ];

    pg_pool.query(query, vars, (err, result) => {
      if (err) {
        console.error(err);
      }

      res.redirect('/' + req.body.board);
    });
  }
});

module.exports = router;
