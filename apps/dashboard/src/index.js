require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const path = require('path');
const helmet = require('helmet');

require('./lib/passport');
const { connectDb } = require('./lib/db');

const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'https://cdn.discordapp.com', 'data:', 'https:'],
        connectSrc: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// Static files
app.use(express.static(path.join(__dirname, '../public')));

// Body parsing
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Sessions
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'flynnbot-change-this-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false,
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

// Passport
app.use(passport.initialize());
app.use(passport.session());

// Global view locals
app.use((req, res, next) => {
  res.locals.user = req.user || null;
  res.locals.clientId = process.env.DISCORD_CLIENT_ID;
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api', apiRoutes);
app.use('/dashboard', dashboardRoutes);

// Home
app.get('/', (req, res) => res.render('index'));

// 404
app.use((req, res) => {
  res.status(404).render('error', { code: 404, message: 'Page not found.' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('[Dashboard Error]', err);
  res.status(500).render('error', { code: 500, message: 'An unexpected error occurred.' });
});

app.listen(PORT, async () => {
  await connectDb();
  console.log(`\n  Dashboard → http://localhost:${PORT}\n`);
});
