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
      posts: result.rows });
  });
});

module.exports = router;
