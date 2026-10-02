/* Login, centre registration and profile/password management. */
(function () {
  'use strict';
  const CTP = window.CTP;
  const h = CTP.h;

  CTP.pages.login = async function login(params, query) {
    const next = query.get('next') || '/dashboard';
    const form = h('form', {
      class: 'card',
      onSubmit: async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button[type="submit"]');
        btn.disabled = true;
        try {
          const res = await CTP.post('auth/login', CTP.formValues(form));
          await CTP.loadSession();
          CTP.toast(`Welcome back, ${res.user.name.split(' ')[0]}!`, 'ok');
          CTP.navigate(res.user.role === 'admin' ? '/admin' : next);
        } catch (err) {
          CTP.notifyError(err);
        } finally {
          btn.disabled = false;
        }
      }
    },
      h('h2', null, 'Sign in'),
      h('p', { class: 'muted small' }, 'For centre coordinators and administrators.'),
      h('div', { class: 'grid' },
        CTP.field('Email', CTP.input('email', { type: 'email', required: true, autocomplete: 'username' })),
        CTP.field('Password', CTP.input('password', { type: 'password', required: true, autocomplete: 'current-password' }))),
      h('div', { class: 'form-actions' },
        h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, 'Sign in')),
      h('p', { class: 'small muted center', style: { marginTop: '1rem', marginBottom: 0 } },
        'New centre? ', h('a', { href: '#/register' }, 'Register your centre')));

    return h('div', { class: 'page', style: { maxWidth: '520px' } },
      h('div', { class: 'page-head' }, h('h1', null, 'Coordinator & admin access')),
      form,
      h('div', { class: 'card', style: { marginTop: '1rem' } },
        h('h3', null, 'Who can sign in?'),
        h('ul', { class: 'small muted', style: { paddingLeft: '1.1rem', marginBottom: 0 } },
          h('li', null, h('b', null, 'Administrators'), ' manage all centres, users, programs and announcements.'),
          h('li', null, h('b', null, 'Centre coordinators'), ' maintain their own centre profile, sessions and certificate records.'),
          h('li', null, 'Learners do not need an account — use the ', h('a', { href: '#/enroll' }, 'enrollment form'), '.'))));
  };

  CTP.pages.register = async function register() {
    const done = h('div');
    const picker = CTP.zonePicker({ zoneField: 'zone', stateField: 'state', requireState: true });

    const form = h('form', {
      class: 'card',
      onSubmit: async (e) => {
        e.preventDefault();
        const values = CTP.formValues(form);
        if (values.password !== values.confirmPassword) {
          CTP.toast('Passwords do not match.', 'error');
          return;
        }
        const btn = form.querySelector('button[type="submit"]');
        btn.disabled = true;
        try {
          const res = await CTP.post('auth/register', values);
          form.remove();
          CTP.clear(done);
          done.append(h('div', { class: 'card', style: { borderColor: 'var(--ok)' } },
            h('h2', null, '🎉 Registration submitted'),
            h('p', null, res.message),
            res.zoneLabel ? h('p', { class: 'small muted' }, `Zone on record: ${res.zoneLabel}`) : null,
            h('a', { class: 'btn btn-primary', href: '#/login' }, 'Go to sign in')));
        } catch (err) {
          CTP.notifyError(err);
        } finally {
          btn.disabled = false;
        }
      }
    },
      h('fieldset', null,
        h('legend', null, '1 · Coordinator account'),
        h('div', { class: 'form-grid' },
          CTP.field('Your full name *', CTP.input('name', { required: true })),
          CTP.field('Email *', CTP.input('email', { type: 'email', required: true, autocomplete: 'username' })),
          CTP.field('Phone', CTP.input('phone')),
          CTP.field('Designation', CTP.input('designation', { placeholder: 'Centre Coordinator', value: 'Centre Coordinator' })),
          CTP.field('Password *', CTP.input('password', { type: 'password', required: true, minlength: '8', autocomplete: 'new-password' }), 'Minimum 8 characters.'),
          CTP.field('Confirm password *', CTP.input('confirmPassword', { type: 'password', required: true, minlength: '8', autocomplete: 'new-password' })))),

      h('fieldset', null,
        h('legend', null, '2 · Zone & state'),
        h('p', { class: 'tiny muted', style: { marginTop: 0 } },
          'CTP is organised into 12 national zones. Pick your zone first — the state list narrows to the states that zone covers.'),
        picker.node,
        h('details', { class: 'zone-table-toggle' },
          h('summary', null, 'View the full zone → state table'),
          CTP.zoneTable())),

      h('fieldset', null,
        h('legend', null, '3 · Centre details'),
        h('div', { class: 'form-grid' },
          CTP.field('Centre name *', CTP.input('centreName', { required: true, placeholder: 'e.g. Rohini Skill Hub' })),
          CTP.field('City / town *', CTP.input('city', { required: true })),
          CTP.field('District', CTP.input('district')),
          CTP.field('PIN code', CTP.input('pincode', { placeholder: '110085', maxlength: '6', inputmode: 'numeric' })),
          CTP.field('Address line', CTP.input('line1', { placeholder: 'Building, street, locality' })),
          CTP.field('Delivery mode', CTP.select('mode', [
            { value: 'onsite', label: 'In-centre' },
            { value: 'hybrid', label: 'Hybrid' },
            { value: 'online', label: 'Online only' }
          ], 'onsite')))),

      h('p', { class: 'tiny muted' },
        'After an administrator approves your account you can add the coordination team, volunteers, sessions and certificate records.'),
      h('div', { class: 'form-actions' },
        h('button', { class: 'btn btn-primary', type: 'submit' }, 'Submit registration'),
        h('a', { class: 'btn btn-ghost', href: '#/login' }, 'I already have an account')));

    return h('div', { class: 'page', style: { maxWidth: '900px' } },
      h('div', { class: 'page-head' },
        h('div', null,
          h('h1', null, 'Register your CTP centre'),
          h('p', { class: 'muted' }, 'Add your centre to the national repository in under a minute.'))),
      form, done);
  };

  CTP.pages.profile = async function profile() {
    const user = CTP.state.user;

    const profileForm = h('form', {
      class: 'card',
      onSubmit: async (e) => {
        e.preventDefault();
        try {
          await CTP.put('auth/profile', CTP.formValues(profileForm));
          await CTP.loadSession();
          CTP.toast('Profile updated.', 'ok');
        } catch (err) { CTP.notifyError(err); }
      }
    },
      h('h3', null, 'Your profile'),
      h('div', { class: 'form-grid' },
        CTP.field('Full name', CTP.input('name', { value: user.name, required: true })),
        CTP.field('Email', CTP.input('email', { value: user.email, disabled: true })),
        CTP.field('Phone', CTP.input('phone', { value: user.phone || '' })),
        CTP.field('Designation', CTP.input('designation', { value: user.designation || '' }))),
      h('div', { class: 'form-actions' }, h('button', { class: 'btn btn-primary', type: 'submit' }, 'Save profile')));

    const pwForm = h('form', {
      class: 'card',
      onSubmit: async (e) => {
        e.preventDefault();
        const values = CTP.formValues(pwForm);
        if (values.newPassword !== values.confirmPassword) {
          CTP.toast('New passwords do not match.', 'error');
          return;
        }
        try {
          await CTP.post('auth/password', values);
          pwForm.reset();
          await CTP.loadSession();
          CTP.toast('Password changed.', 'ok');
        } catch (err) { CTP.notifyError(err); }
      }
    },
      h('h3', null, 'Change password'),
      user.mustChangePassword
        ? h('div', { class: 'alert warn' }, 'You are still using a password set by an administrator. Please change it now.')
        : null,
      h('div', { class: 'form-grid' },
        CTP.field('Current password', CTP.input('currentPassword', { type: 'password', required: true, autocomplete: 'current-password' })),
        CTP.field('New password', CTP.input('newPassword', { type: 'password', required: true, minlength: '8', autocomplete: 'new-password' })),
        CTP.field('Confirm new password', CTP.input('confirmPassword', { type: 'password', required: true, minlength: '8', autocomplete: 'new-password' }))),
      h('div', { class: 'form-actions' }, h('button', { class: 'btn btn-primary', type: 'submit' }, 'Update password')));

    return h('div', { class: 'page', style: { maxWidth: '900px' } },
      h('div', { class: 'page-head' },
        h('div', null,
          h('h1', null, 'My account'),
          h('p', { class: 'muted' },
            `${CTP.fmt.title(user.role)} · ${CTP.state.centre ? CTP.state.centre.name : 'No centre assigned'}`))),
      h('div', { class: 'grid grid-2' }, profileForm, pwForm));
  };
})();
