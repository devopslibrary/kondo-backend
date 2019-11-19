'use strict';

const express = require('express');
const getUserOrgs = require('./library/githubUser/getUserOrgs');
const getUser = require('./library/githubUser/getUser');
const getRepos = require('./library/githubUser/getRepos');
const managementApiToken = require('./library/auth0/getManagementApiToken');
const session = require('express-session');
const redis = require('redis');
let RedisStore = require('connect-redis')(session);
let redisClient = redis.createClient();
require('dotenv').config();

// Create a new Express app
const app = express();

// Logging
const pino = require('pino');
const expressPino = require('express-pino-logger');
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
const expressLogger = expressPino({ logger });
app.use(expressLogger);

// Define middleware that validates incoming bearer tokens
const checkJwt = require('./src/middleware/authGuard');

// Use session https://github.com/expressjs/session
var sess = {
  store: new RedisStore({ client: redisClient }),
  secret: 'I like Santa',
  cookie: {},
  resave: false,
  saveUninitialized: false,
};
if (app.get('env') === 'production') {
  app.set('trust proxy', 1); // trust first proxy
  sess.cookie.secure = true; // serve secure cookies
}
app.use(session(sess));
// End session code

// Get management token from Auth0
let authToken;
app.use(express.json());
app.listen(3000, async function() {
  logger.info('App is ready');
  await managementApiToken.token.then(function(token) {
    authToken = token;
  });
});

// Retrieve Org Information
app.get('/orgs', checkJwt, async (req, res) => {
  if (!req.session.orgs) {
    const userId = req.user.sub.split('|')[1];
    const githubUser = await getUser(authToken, userId);
    const githubToken = githubUser.identities[0].access_token;
    const orgs = await getUserOrgs(githubToken);
    req.session.orgs = orgs;
  }
  req.log.info('Returning cached Github Orgs');
  res.send(req.session.orgs);
});

// Receive Repo Information
app.get('/orgs/repos', checkJwt, async (req, res) => {
  const userId = req.user.sub.split('|')[1];
  const githubUser = await getUser(authToken, userId);
  const githubToken = githubUser.identities[0].access_token;
  const repos = await getRepos(req.query.org, githubToken);
  res.send(repos);
});

process.on('SIGINT', function() {
  redisClient.quit();
  console.log('redis client quit');
});
