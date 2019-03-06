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

const updateBoards = function(req, res, next) {
  if (!boards.length) {
    pg_pool.query('SELECT * FROM boards ORDER BY name ASC;', (err, result) => {
      if (err) {
        console.error(err);
      }
      else {
        boards = result.rows;
      }

      next();
    });
  }
  else {
    next();
  }
};

router.use(updateBoards);


// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
// *                                                  * // Helper Functions //
function addChild(parent_ids, reply_id) {
  for (let i = 0; i < parent_ids.length; i++) {
    const parent_id = parent_ids[i];

    const query = 'SELECT children FROM replies WHERE id = $1;';
    const vars = [ parent_id ];

    pg_pool.query(query, vars, (err, result) => {
      if (err) {
        console.error(err);
      }
      else {
        let children;

        if (result.rows[0].children) {
          children = JSON.parse(result.rows[0].children);
          children.push(reply_id);
        }
        else {
          children = [ reply_id ];
        }

        const query2 = 'UPDATE replies SET children = $1 WHERE id = $2';
        const vars2 = [
          JSON.stringify(children),
          parent_id ];

        pg_pool.query(query2, vars2, (err, result) => {
          if (err) {
            console.error(err);
          }
        });
      }
    });
  }
}


// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
// *                                                           * // Routing //
router.get('/', function(req, res, next) {
  res.render('index', { title: website_name, boards: boards });
});

router.get('/:board', function(req, res, next) {
  const query = 'SELECT * FROM posts WHERE board = $1 ORDER BY time_stamp DESC;'; // eslint-disable-line max-len
  const vars = [ req.params.board ];

  pg_pool.query(query, vars, (err, result) => {
    if (err) {
      console.error(err);
    }

    const post_ids = [];
    for (let i = 0; i < result.rows.length; i++) {
      post_ids.push(result.rows[i].id);
    }

    let query2 = '';

    if (post_ids.length > 1) {
      query2 = 'SELECT * FROM replies WHERE parent IN (' + post_ids.toString() + ') ORDER BY id ASC;'; // eslint-disable-line max-len
    }
    else if (post_ids.length == 1) {
      query2 = 'SELECT * FROM replies WHERE parent = ' + post_ids[0] + ' ORDER BY id ASC;'; // eslint-disable-line max-len
    }
    else {
      query2 = 'SELECT * FROM replies;';
    }

    pg_pool.query(query2, (err2, result2) => {
      if (err2) {
        console.error(err2);
      }

      res.render('board', {
        title: req.params.board + ' - ' + website_name,
        boards: boards,
        board: req.params.board,
        posts: result.rows,
        replies: result2.rows });
    });
  });
});

router.post('/new_post', function(req, res, next) {
  if (!req.body.text) {
    res.redirect('/' + req.body.board);
  }
  else {
    const query = 'INSERT INTO posts (board, poster, title, text, image_url, time_stamp) VALUES ($1, $2, $3, $4, $5, $6);'; // eslint-disable-line max-len
    const vars = [
      req.body.board,
      req.body.username || null,
      req.body.title || null,
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

router.post('/reply/:id', function(req, res, next) {
  if (!req.body.text) {
    res.redirect('/' + req.body.board);
  }
  else {
    const query = 'INSERT INTO replies (parent, poster, text, image_url, time_stamp) VALUES ($1, $2, $3, $4, $5) RETURNING id;'; // eslint-disable-line max-len
    const vars = [
      req.params.id,
      req.body.username || null,
      req.body.text,
      req.body.image_url || null,
      getTimestamp() ];

    pg_pool.query(query, vars, (err, result) => {
      if (err) {
        console.error(err);
      }

      res.redirect('/post/' + req.params.id.toString());

      // Find what comments this reply is replying to,
      // so that their children can be updated
      const parents = [];
      const split_up = req.body.text.split('\n');

      for (let i = 0; i < split_up.length; i++) {
        if (split_up[i].includes('>')) {
          parents.push(parseInt(split_up[i].slice(1), 10));
        }
      }

      addChild(parents, result.rows[0].id);
    });
  }
});

router.get('/reply/:id', function(req, res, next) {
  const query = 'SELECT * FROM replies WHERE id = $1;';
  const vars = [ req.params.id ];

  pg_pool.query(query, vars, (err, result) => {
    if (err) {
      console.error(err);
    }

    post_id = result.rows[0].parent;
    res.redirect('/post/' + post_id.toString() + '?h=' + req.params.id);
  });
});

router.get('/post/:id', function(req, res, next) {
  const query = 'SELECT * FROM posts WHERE id = $1;';
  const vars = [ req.params.id ];

  pg_pool.query(query, vars, (err, result) => {
    if (err) {
      console.error(err);
    }

    query2 = 'SELECT * FROM replies WHERE parent = ' + req.params.id + ' ORDER BY id ASC;'; // eslint-disable-line max-len

    pg_pool.query(query2, (err2, result2) => {
      if (err2) {
        console.error(err2);
      }

      res.render('board', {
        title: website_name,
        boards: boards,
        posts: result.rows,
        replies: result2.rows,
        highlight: req.query.h });
    });
  });
});

module.exports = router;
