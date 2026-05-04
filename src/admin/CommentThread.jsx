// Threaded comments on any target id. Realtime via SSE.
import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../auth/api';
import { useAuth } from '../auth/AuthContext';
import { useRealtime } from '../auth/useRealtime';
import './CommentThread.css';

export default function CommentThread({ target, label = 'Discussion' }) {
  const { user } = useAuth();
  const { on } = useRealtime();
  const [items, setItems] = useState([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingDraft, setEditingDraft] = useState('');

  const refresh = useCallback(async () => {
    try { const r = await api.listComments(target); setItems(r.comments || []); }
    catch {}
  }, [target]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const offs = ['comment.new', 'comment.update', 'comment.delete'].map(ev =>
      on(ev, (d) => { if (d.target === target) refresh(); })
    );
    return () => offs.forEach(off => off?.());
  }, [target, on, refresh]);

  const submit = async (e) => {
    e.preventDefault();
    if (!draft.trim()) return;
    setErr(''); setBusy(true);
    try {
      await api.createComment(target, draft.trim());
      setDraft('');
      refresh();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const saveEdit = async (id) => {
    if (!editingDraft.trim()) return;
    try {
      await api.editComment(id, editingDraft.trim());
      setEditingId(null);
      refresh();
    } catch (e) { setErr(e.message); }
  };

  const remove = async (c) => {
    if (!confirm('Delete this comment?')) return;
    try { await api.deleteComment(c.id); refresh(); }
    catch (e) { setErr(e.message); }
  };

  return (
    <div className="cmt">
      <div className="cmt__head">{label}</div>

      {err && <div className="adm__msg adm__msg--err" style={{ marginBottom: 8 }}>{err}</div>}

      <div className="cmt__list">
        {items.length === 0 && <div className="cmt__empty">No comments yet.</div>}
        {items.map(c => (
          <div key={c.id} className={'cmt__item' + (c.deletedAt ? ' is-deleted' : '')}>
            <div className="cmt__row">
              <span className="cmt__avatar">{c.author?.initials || '·'}</span>
              <div className="cmt__bubble">
                <div className="cmt__meta">
                  <b>{c.author?.name || 'unknown'}</b>
                  <em>{relTime(c.createdAt)}{c.editedAt ? ' · edited' : ''}</em>
                </div>
                {editingId === c.id ? (
                  <>
                    <textarea
                      className="cmt__edit-input"
                      value={editingDraft}
                      onChange={e => setEditingDraft(e.target.value)}
                      rows={2} autoFocus
                    />
                    <div className="cmt__actions">
                      <button className="cmt__btn" onClick={() => saveEdit(c.id)}>Save</button>
                      <button className="cmt__btn cmt__btn--ghost" onClick={() => setEditingId(null)}>Cancel</button>
                    </div>
                  </>
                ) : (
                  <div className="cmt__body">{renderBody(c.body)}</div>
                )}
              </div>
              {!c.deletedAt && c.authorId === user.id && editingId !== c.id && (
                <div className="cmt__row-actions">
                  <button onClick={() => { setEditingId(c.id); setEditingDraft(c.body); }}>Edit</button>
                  <button onClick={() => remove(c)}>Delete</button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <form className="cmt__compose" onSubmit={submit}>
        <textarea
          className="cmt__input"
          placeholder="Add a comment… use @username or @user@email.com to mention"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          rows={2}
        />
        <button className="cmt__btn" disabled={busy || !draft.trim()} type="submit">{busy ? '…' : 'Post'}</button>
      </form>
    </div>
  );
}

// Highlight @-mentions in the body
function renderBody(body) {
  const re = /(@[A-Za-z0-9._-]+(?:@[A-Za-z0-9.-]+\.[A-Za-z]{2,})?)/g;
  const parts = body.split(re);
  return parts.map((p, i) =>
    re.test(p) ? <span key={i} className="cmt__mention">{p}</span> : <span key={i}>{p}</span>
  );
}

function relTime(t) {
  const sec = Math.floor((Date.now() - new Date(t).getTime()) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return new Date(t).toLocaleDateString();
}
