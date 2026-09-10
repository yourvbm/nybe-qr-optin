// Shared opt-in form logic for both QR landing pages.
// Set window.NYBE_CONFIG = { source: 'spin' | 'inbox', thanksUrl: '...' } before this script runs.

(function () {
  var WORKER_URL = 'https://nybe-qr-worker.miriam-68c.workers.dev/api/optin';

  var config = window.NYBE_CONFIG || {};
  var form = document.getElementById('optin-form');
  var interestInputs = Array.prototype.slice.call(document.querySelectorAll('input[name="interests"]'));
  var countEl = document.getElementById('interests-count');
  var errorEl = document.getElementById('error-msg');
  var submitBtn = document.getElementById('submit-btn');
  var MAX_INTERESTS = 5;

  function selectedInterests() {
    return interestInputs.filter(function (i) { return i.checked; });
  }

  function updateCount() {
    var n = selectedInterests().length;
    countEl.textContent = n + ' of ' + MAX_INTERESTS + ' selected';
    countEl.classList.toggle('full', n >= MAX_INTERESTS);
    interestInputs.forEach(function (i) {
      if (!i.checked) i.disabled = n >= MAX_INTERESTS;
    });
  }

  interestInputs.forEach(function (i) {
    i.addEventListener('change', updateCount);
  });
  updateCount();

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.add('show');
  }

  function clearError() {
    errorEl.classList.remove('show');
    errorEl.textContent = '';
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    clearError();

    var firstName = form.firstName.value.trim();
    var email = form.email.value.trim();
    var interests = selectedInterests().map(function (i) { return i.value; });

    if (!firstName) return showError('Please enter your first name.');
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return showError('Please enter a valid email address.');
    if (interests.length < 1) return showError('Please choose at least one interest.');

    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: firstName,
        email: email,
        interests: interests,
        source: config.source || 'qr',
        company: form.company ? form.company.value : '' // honeypot
      })
    })
      .then(function (res) {
        if (!res.ok) throw new Error('bad_response');
        return res.json();
      })
      .then(function (data) {
        if (!data || !data.ok) throw new Error('not_ok');
        window.location.href = config.thanksUrl || 'thanks.html';
      })
      .catch(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit';
        showError("Something went wrong on our end. Please try again in a moment.");
      });
  });
})();
