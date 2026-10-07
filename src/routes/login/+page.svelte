<script>
	import { login } from '$lib/authStore.svelte.js';

	// 컴포넌트 안의 $state는 React의 useState와 비슷하다. bind:value로 input과 양방향 연결된다
	// (React에서는 value + onChange를 직접 짝지어야 한다).
	let email = $state('');
	let password = $state('');
	let errorMessage = $state('');
	let submitting = $state(false);

	async function handleSubmit(event) {
		event.preventDefault();
		errorMessage = '';
		submitting = true;
		try {
			await login(email, password); // 성공 후 이동은 +layout.svelte 가드가 처리
		} catch (err) {
			// err.status가 있으면 서버가 준 메시지, 없으면 네트워크 실패
			errorMessage = err.status ? err.message : '서버에 연결할 수 없습니다';
		} finally {
			submitting = false;
		}
	}
</script>

<div class="login-page">
	<form class="login-card" onsubmit={handleSubmit} novalidate>
		<div class="login-brand">
			<div class="brand-mark">M</div>
			<div class="brand-title">MPW Plus</div>
		</div>
		<h1 class="login-title">로그인</h1>
		<label class="field">
			<span>이메일</span>
			<input type="email" bind:value={email} autocomplete="username" />
		</label>
		<label class="field">
			<span>비밀번호</span>
			<input type="password" bind:value={password} autocomplete="current-password" />
		</label>
		<button type="submit" class="login-btn" disabled={submitting}>로그인</button>
		{#if errorMessage}<p class="login-error" role="alert">⚠ {errorMessage}</p>{/if}
	</form>
</div>

<style>
	.login-page {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--bg-page);
	}
	.login-card {
		width: 360px;
		background: var(--bg-panel);
		border: 1px solid var(--border);
		border-radius: 14px;
		padding: 32px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.login-brand {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.brand-mark {
		width: 36px;
		height: 36px;
		border-radius: 10px;
		background: linear-gradient(135deg, var(--accent-strong), var(--accent-strong2));
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		color: var(--accent-contrast);
	}
	.brand-title {
		font-weight: 700;
		font-size: 14px;
		color: var(--text-primary);
	}
	.login-title {
		font-size: 20px;
		color: var(--text-strong);
		margin: 0;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.field span {
		color: var(--text-secondary);
		font-size: 13px;
	}
	.field input {
		background: var(--bg-page);
		border: 1px solid var(--border);
		color: var(--text-primary);
		border-radius: 8px;
		padding: 10px 12px;
	}
	.field input:focus {
		border-color: var(--accent);
		outline: none;
	}
	.login-btn {
		background: var(--accent-strong);
		color: var(--accent-contrast);
		border: none;
		border-radius: 8px;
		padding: 10px;
		font-weight: 600;
		cursor: pointer;
	}
	.login-btn:disabled {
		opacity: 0.6;
		cursor: default;
	}
	.login-error {
		color: var(--danger-light);
		background: var(--danger-soft-15);
		border: 1px solid var(--danger);
		border-radius: 8px;
		padding: 10px 12px;
		font-size: 13px;
		margin: 0;
	}
</style>
