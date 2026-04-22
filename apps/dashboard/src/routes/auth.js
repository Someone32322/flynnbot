const express = require('express');
const passport = require('passport');
const router = express.Router();

// Redirect to Discord OAuth
router.get('/login', passport.authenticate('discord'));

// Discord OAuth callback
router.get(
  '/callback',
  passport.authenticate('discord', { failureRedirect: '/?error=1' }),
  (req, res) => {
    res.redirect('/dashboard');
  }
);

// Logout
router.get('/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy(() => {
      res.redirect('/');
    });
  });
});

module.exports = router;
