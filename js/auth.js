(function () {
  var App = window.App;
  if (!App || !App.ready) return;
  var page = document.body.dataset.page;
  var slot = document.getElementById('message');

  if (page === 'login') {
    var loginForm = document.getElementById('login-form');
    loginForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      var button = loginForm.querySelector('button[type="submit"]');
      button.disabled = true;
      App.showMessage(slot, 'error', '');
      try {
        var data = await App.api('/auth/login', {
          method: 'POST',
          body: {
            email: document.getElementById('email').value,
            password: document.getElementById('password').value
          }
        });
        App.setSession(data.token, data.user);
        App.showMessage(slot, 'success', 'Login successful! Redirecting to dashboard...');
        setTimeout(function () {
          window.location.href = 'dashboard.html';
        }, 600);
      } catch (err) {
        App.showMessage(slot, 'error', err.message);
        button.disabled = false;
      }
    });
  }

  if (page === 'register') {
    var form = document.getElementById('registration-form');
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var password = document.getElementById('password').value;
      var confirmPassword = document.getElementById('confirm-password').value;
      if (password !== confirmPassword) {
        App.showMessage(slot, 'error', 'Passwords do not match!');
        return;
      }
      if (password.length < 8) {
        App.showMessage(slot, 'error', 'Password must be at least 8 characters long!');
        return;
      }
      var button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      App.showMessage(slot, 'error', '');
      try {
        await App.api('/auth/register', {
          method: 'POST',
          body: {
            fullname: document.getElementById('fullname').value,
            email: document.getElementById('email').value,
            password: password,
            confirmPassword: confirmPassword,
            role: document.getElementById('role').value
          }
        });
        App.showMessage(slot, 'success', 'Registration successful! Taking you to the login page...');
        setTimeout(function () {
          window.location.href = 'login.html';
        }, 1800);
      } catch (err) {
        App.showMessage(slot, 'error', err.message);
        button.disabled = false;
      }
    });
  }
})();
