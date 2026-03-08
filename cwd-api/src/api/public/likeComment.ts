import { Context } from 'hono';
import { Bindings } from '../../bindings';

type CommentLikeResponse = {
	id: number;
	likes: number;
	liked: boolean;
	alreadyLiked?: boolean;
};

function getUserIdFromRequest(c: Context<{ Bindings: Bindings }>): string {
	const header =
		c.req.header('X-CWD-Like-User') ||
		c.req.header('x-cwd-like-user') ||
		'';
	const fromHeader = header.trim();
	if (fromHeader) {
		return fromHeader;
	}
	const ip = c.req.header('cf-connecting-ip') || '';
	const trimmedIp = ip.trim();
	if (trimmedIp) {
		return `ip:${trimmedIp}`;
	}
	return 'anonymous';
}

export const likeComment = async (c: Context<{ Bindings: Bindings }>) => {
	let body: any = null;
	try {
		body = await c.req.json();
	} catch {
		body = null;
	}

	const rawId =
		(body && (body.id ?? body.commentId)) ??
		c.req.query('id') ??
		c.req.query('commentId') ??
		null;

	const parsed =
		typeof rawId === 'number'
			? rawId
			: typeof rawId === 'string' && rawId.trim()
			? Number.parseInt(rawId.trim(), 10)
			: NaN;

	if (!Number.isFinite(parsed) || parsed <= 0) {
		return c.json({ message: 'Missing or invalid id' }, 400);
	}

	const id = parsed;
	const userId = getUserIdFromRequest(c);
	const now = Date.now();

	try {
		const existing = await c.env.CWD_DB.prepare(
			'SELECT id, likes FROM Comment WHERE id = ?'
		)
			.bind(id)
			.first<{ id: number; likes?: number }>();

		if (!existing) {
			return c.json({ message: 'Comment not found' }, 404);
		}

		const existingLike = await c.env.CWD_DB.prepare(
			'SELECT id FROM CommentLikes WHERE comment_id = ? AND user_id = ?'
		)
			.bind(id, userId)
			.first<{ id: number }>();

		let liked = false;
		let alreadyLiked = false;

		if (!existingLike) {
			try {
				await c.env.CWD_DB.prepare(
					'INSERT INTO CommentLikes (comment_id, user_id, created_at) VALUES (?, ?, ?)'
				)
					.bind(id, userId, now)
					.run();

				await c.env.CWD_DB.prepare(
					'UPDATE Comment SET likes = COALESCE(likes, 0) + 1 WHERE id = ?'
				)
					.bind(id)
					.run();

				liked = true;
			} catch (insertError: any) {
				if (insertError?.message?.includes('UNIQUE constraint failed')) {
					alreadyLiked = true;
					liked = true;
				} else {
					throw insertError;
				}
			}
		} else {
			alreadyLiked = true;
			liked = true;
		}

		const updated = await c.env.CWD_DB.prepare(
			'SELECT COALESCE(likes, 0) as likes FROM Comment WHERE id = ?'
		)
			.bind(id)
			.first<{ likes?: number }>();

		const likes =
			updated && typeof updated.likes === 'number' && Number.isFinite(updated.likes) && updated.likes >= 0
				? updated.likes
				: ((existing.likes || 0) + (liked && !alreadyLiked ? 1 : 0));

		const response: CommentLikeResponse = {
			id,
			likes,
			liked,
			alreadyLiked
		};

		return c.json(response);
	} catch (e: any) {
		return c.json({ message: e?.message || '点赞失败' }, 500);
	}
};

export const unlikeComment = async (c: Context<{ Bindings: Bindings }>) => {
	let body: any = null;
	try {
		body = await c.req.json();
	} catch {
		body = null;
	}

	const rawId =
		(body && (body.id ?? body.commentId)) ??
		c.req.query('id') ??
		c.req.query('commentId') ??
		null;

	const parsed =
		typeof rawId === 'number'
			? rawId
			: typeof rawId === 'string' && rawId.trim()
			? Number.parseInt(rawId.trim(), 10)
			: NaN;

	if (!Number.isFinite(parsed) || parsed <= 0) {
		return c.json({ message: 'Missing or invalid id' }, 400);
	}

	const id = parsed;
	const userId = getUserIdFromRequest(c);

	try {
		const existing = await c.env.CWD_DB.prepare(
			'SELECT id, likes FROM Comment WHERE id = ?'
		)
			.bind(id)
			.first<{ id: number; likes?: number }>();

		if (!existing) {
			return c.json({ message: 'Comment not found' }, 404);
		}

		const existingLike = await c.env.CWD_DB.prepare(
			'SELECT id FROM CommentLikes WHERE comment_id = ? AND user_id = ?'
		)
			.bind(id, userId)
			.first<{ id: number }>();

		if (!existingLike) {
			const currentLikes =
				typeof existing.likes === 'number' && Number.isFinite(existing.likes) && existing.likes >= 0
					? existing.likes
					: 0;
			return c.json({
				id,
				likes: currentLikes,
				liked: false
			});
		}

		await c.env.CWD_DB.prepare(
			'DELETE FROM CommentLikes WHERE comment_id = ? AND user_id = ?'
		)
			.bind(id, userId)
			.run();

		await c.env.CWD_DB.prepare(
			'UPDATE Comment SET likes = MAX(0, COALESCE(likes, 1) - 1) WHERE id = ?'
		)
			.bind(id)
			.run();

		const updated = await c.env.CWD_DB.prepare(
			'SELECT COALESCE(likes, 0) as likes FROM Comment WHERE id = ?'
		)
			.bind(id)
			.first<{ likes?: number }>();

		const likes =
			updated && typeof updated.likes === 'number' && Number.isFinite(updated.likes) && updated.likes >= 0
				? updated.likes
				: 0;

		return c.json({
			id,
			likes,
			liked: false
		});
	} catch (e: any) {
		return c.json({ message: e?.message || '取消点赞失败' }, 500);
	}
};

export const getCommentLikeStatus = async (c: Context<{ Bindings: Bindings }>) => {
	const rawIds = c.req.query('ids') || '';
	const userId = getUserIdFromRequest(c);

	if (!rawIds.trim()) {
		return c.json({ likedIds: [] });
	}

	const ids = rawIds
		.split(',')
		.map((s) => s.trim())
		.filter((s) => {
			const n = Number.parseInt(s, 10);
			return Number.isFinite(n) && n > 0;
		})
		.map((s) => Number.parseInt(s, 10));

	if (ids.length === 0) {
		return c.json({ likedIds: [] });
	}

	try {
		const placeholders = ids.map(() => '?').join(',');
		const rows = await c.env.CWD_DB.prepare(
			`SELECT comment_id FROM CommentLikes WHERE comment_id IN (${placeholders}) AND user_id = ?`
		)
			.bind(...ids, userId)
			.all<{ comment_id: number }>();

		const likedIds = (rows.results || []).map((r) => r.comment_id);

		return c.json({ likedIds });
	} catch (e: any) {
		return c.json({ likedIds: [], message: e?.message || '获取点赞状态失败' }, 500);
	}
};
