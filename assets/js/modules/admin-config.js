const ADMIN_EMAIL = 'admin@superclothing.com';
const ADMIN_PASSWORD = 'Admin12345';

function isAdminUser(user) {
    return Boolean(user?.email) && user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
}

function isAdminCredentials(email, password) {
    return email.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase() && password === ADMIN_PASSWORD;
}

export {
    ADMIN_EMAIL,
    ADMIN_PASSWORD,
    isAdminCredentials,
    isAdminUser
};
