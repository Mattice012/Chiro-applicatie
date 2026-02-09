window.onload = async () => {
    lucide.createIcons();
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) window.location.href = 'dashboard.html';
};

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const btnText = document.getElementById('login-btn-text');
    const loader = document.getElementById('login-loader');

    btnText.classList.add('hidden');
    loader.classList.remove('hidden');

    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        window.location.href = 'dashboard.html';
    } catch (err) {
        showToast(err.message || 'Login mislukt', 'error');
        btnText.classList.remove('hidden');
        loader.classList.add('hidden');
    }
});