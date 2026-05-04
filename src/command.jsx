// Mandate 2.0 — Command Center

import React, { useState as cUS, useEffect as cUE, useRef as cUR, useMemo as cUM } from 'react';
import './command.css';
import { CMD_WORKSPACES, CMD_GROUPS, CMD_MESSAGES, CMD_THREAD, CMD_SLASH } from './command-data';

// ── Sidebar item row
function CmdItem({ it, active, onClick }) {
  const cls = ['cmd__item'];
  if (it.type === 'dm') cls.push('cmd__item--dm');
  if (it.name === 'Marcus Hale') cls.push('cmd__item--mla');
  if (it.urgent) cls.push('cmd__item--urgent');
  if (it.live) cls.push('cmd__item--live-huddle');
  if (active) cls.push('cmd__item--active');

  const hash = it.type === 'ch' ? (it.priv ? '🔒' : '#')
             : it.type === 'huddle' ? (it.live ? '🔊' : '🎙')
             : null;

  return (
    <div className={cls.join(' ')} onClick={onClick}>
      {it.type === 'dm'
        ? <div className="cmd__item-avatar">{it.avatar}</div>
        : <span className="cmd__item-hash">{hash}</span>}
      <span className="cmd__item-name">{it.name}</span>
      {it.type === 'huddle' && it.live && <span style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--ok)' }}>{it.count}</span>}
      {it.unread > 0 && <span className="cmd__item-unread">{it.unread}</span>}
    </div>
  );
}

// ── Message body with @mention + slash-cmd highlighting
function MsgText({ text, mentions=[] }) {
  const parts = [];
  let s = text;
  // mentions
  mentions.forEach(m => {
    const tag = '@' + m;
    s = s.split(tag).join('§§§MENTION:' + m + '§§§');
  });
  // slash
  s = s.replace(/(\/[a-z]+)/g, '§§§SLASH:$1§§§');

  return (
    <div className="msg__body">
      {s.split(/§§§/).map((p, i) => {
        if (p.startsWith('MENTION:')) return <span key={i} className="mention">@{p.slice(8)}</span>;
        if (p.startsWith('SLASH:')) return <span key={i} className="slash-cmd">{p.slice(6)}</span>;
        return <React.Fragment key={i}>{p}</React.Fragment>;
      })}
    </div>
  );
}

function Msg({ m, onThread, showHover = true }) {
  const cls = ['msg'];
  if (m.bot) cls.push('msg--bot');
  if (m.disappearing) cls.push('msg--disappearing');

  return (
    <div className={cls.join(' ')}>
      <div className={'msg__av' + (m.mla ? ' msg__av--mla' : '') + (m.bot ? ' msg__av--bot' : '')}>{m.avatar}</div>
      <div>
        <div className="msg__hd">
          <span className={'msg__who' + (m.mla ? ' msg__who--mla' : '') + (m.bot ? ' msg__who--bot' : '')}>{m.who}</span>
          {!m.bot && <span className="msg__role">{m.role}</span>}
          <span className="msg__t">{m.t}</span>
        </div>
        <MsgText text={m.text} mentions={m.mentions} />

        {m.attach && m.attach.kind === 'link-preview' && (
          <div className="att-link">
            <div className="att-link__title">{m.attach.title}</div>
            <div className="att-link__src">{m.attach.src} · {m.attach.ts} ago</div>
          </div>
        )}
        {m.attach && m.attach.kind === 'file' && (
          <div className="att-file"><b>{m.attach.name}</b><em>{m.attach.size}</em></div>
        )}
        {m.card && (
          <div className="att-card">
            <div>
              <div className="att-card__title">{m.card.title}</div>
              <div className="att-card__meta">{m.card.meta}</div>
            </div>
            <div className="att-card__status">{m.card.status}</div>
          </div>
        )}
        {m.voice && (
          <div className="voice">
            <div className="voice__row">
              <div className="voice__play">▶</div>
              <div className="voice__wave">
                {m.voice.waveform.map((h, i) => (
                  <span key={i} style={{ height: Math.max(4, h) + 'px' }} />
                ))}
              </div>
              <div className="voice__dur">{m.voice.duration}</div>
            </div>
            <div className="voice__transcript">{m.voice.transcript}</div>
          </div>
        )}
        {m.poll && (
          <div className="poll">
            <div className="poll__q">{m.poll.q}</div>
            {m.poll.options.map((o, i) => {
              const pct = (o.v / m.poll.total) * 100;
              return (
                <div key={i} className="poll__opt">
                  <div className="poll__opt-bar" style={{ width: pct + '%' }} />
                  <span className="poll__opt-txt">{o.t}</span>
                  <span className="poll__opt-n">{o.v} · {Math.round(pct)}%</span>
                </div>
              );
            })}
            <div className="poll__total">{m.poll.total} votes · closes in 2h 43m</div>
          </div>
        )}

        {m.reactions && m.reactions.length > 0 && (
          <div className="msg__reactions">
            {m.reactions.map(([e, n], i) => (
              <span key={i} className="react-chip">{e}<span>{n}</span></span>
            ))}
            <span className="react-chip react-chip--add">+</span>
          </div>
        )}

        {m.thread > 0 && (
          <div className="msg__thread-link" onClick={() => onThread && onThread(m)}>
            <span className="av-stack"><span>PS</span><span>DT</span><span>MC</span></span>
            <span>{m.thread} repl{m.thread === 1 ? 'y' : 'ies'}</span>
            <span style={{ color:'var(--text-3)' }}>· last 08:10</span>
          </div>
        )}
      </div>

      {showHover && (
        <div className="msg__hover-actions">
          <div className="msg__hover-btn" title="React">😊</div>
          <div className="msg__hover-btn" title="Reply in thread" onClick={() => onThread && onThread(m)}>💬</div>
          <div className="msg__hover-btn" title="Share">↗</div>
          <div className="msg__hover-btn" title="Bookmark">🔖</div>
          <div className="msg__hover-btn" title="More">⋯</div>
        </div>
      )}
    </div>
  );
}

// ── Slash palette
function SlashPal({ q, onPick }) {
  const list = CMD_SLASH.filter(s => s.cmd.startsWith('/' + q));
  if (!list.length) return null;
  return (
    <div className="slash-pal">
      {list.map((s, i) => (
        <div key={s.cmd} className={'slash-pal__row' + (i === 0 ? ' slash-pal__row--on' : '')} onClick={() => onPick(s.cmd)}>
          <div className="slash-pal__cmd">{s.cmd}</div>
          <div className="slash-pal__desc">{s.desc}</div>
        </div>
      ))}
    </div>
  );
}

// ── Composer
function Composer({ channelName }) {
  const [text, setText] = cUS('');
  const showSlash = text.startsWith('/') && text.length >= 1;
  const slashQ = text.slice(1).split(' ')[0];

  return (
    <div className="cmd__comp">
      <div className="cmd__comp-box">
        <div className="cmd__comp-toolbar">
          <div className="cmd__comp-tool" title="Bold">B</div>
          <div className="cmd__comp-tool" title="Italic" style={{ fontStyle:'italic' }}>I</div>
          <div className="cmd__comp-tool" title="Strike" style={{ textDecoration:'line-through' }}>S</div>
          <div className="cmd__comp-tool" title="Link">🔗</div>
          <div className="cmd__comp-tool" title="Code">{'<>'}</div>
          <div className="cmd__comp-tool" title="List">☰</div>
          <div style={{ flex:1 }} />
          <div className="cmd__comp-tool" title="Attach">📎</div>
          <div className="cmd__comp-tool" title="Voice note">🎙</div>
          <div className="cmd__comp-tool" title="Emoji">😊</div>
          <div className="cmd__comp-tool" title="Mention">@</div>
          <div className="cmd__comp-tool" title="Slash">/</div>
        </div>
        <div
          className="cmd__comp-input"
          contentEditable
          suppressContentEditableWarning
          onInput={(e) => setText(e.currentTarget.innerText)}
          data-placeholder={`Message #${channelName}`}
        />
        <div className="cmd__comp-foot">
          <div className="cmd__comp-helpers">
            <span className="cmd__comp-help">/ commands</span>
            <span className="cmd__comp-help">@ mention</span>
            <span className="cmd__comp-help">⇧⏎ newline</span>
            <span className="cmd__comp-help">⏎ send</span>
          </div>
          <button className="cmd__comp-send">SEND</button>
        </div>
      </div>
      {showSlash && <SlashPal q={slashQ} onPick={() => {}} />}
    </div>
  );
}

// ── Thread pane
function ThreadPane({ root, onClose }) {
  return (
    <aside className="cmd__thread">
      <div className="cmd__thread-hd">
        <div>
          <div className="cmd__thread-hd-title">Thread</div>
          <div className="cmd__thread-hd-sub">#war-room · 4 replies</div>
        </div>
        <div className="cmd__thread-x" onClick={onClose}>✕</div>
      </div>
      <div className="cmd__thread-list">
        <div className="cmd__thread-root">
          <Msg m={root} showHover={false} />
        </div>
        {CMD_THREAD.map(t => (
          <Msg key={t.id} m={{...t, role:''}} showHover={false} />
        ))}
      </div>
      <div className="cmd__thread-comp">
        <div className="cmd__comp-box">
          <div className="cmd__comp-input" contentEditable suppressContentEditableWarning />
          <div className="cmd__comp-foot">
            <div className="cmd__comp-helpers"><span className="cmd__comp-help">Also send to #war-room</span></div>
            <button className="cmd__comp-send">REPLY</button>
          </div>
        </div>
      </div>
    </aside>
  );
}

// ── Root
function Command() {
  const [activeCh, setActiveCh] = cUS('c-warroom');
  const [threadRoot, setThreadRoot] = cUS(CMD_MESSAGES.find(m => m.id === 'm1'));
  const [activeWs, setActiveWs] = cUS('mw');
  const streamRef = cUR(null);

  cUE(() => {
    if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight;
  }, []);

  // Override module accent to Command purple
  cUE(() => {
    document.documentElement.style.setProperty('--m-command', '#5a4a8a');
    document.documentElement.style.setProperty('--m-command-tint', '#ece7f4');
  }, []);

  return (
    <div className={'cmd' + (threadRoot ? '' : ' cmd--thread-closed')}>
      {/* Workspace rail */}
      <div className="cmd__rail">
        {CMD_WORKSPACES.map(w => (
          <div
            key={w.id}
            className={'cmd__ws' + (w.id === activeWs ? ' cmd__ws--active' : '')}
            style={{ background: w.color }}
            onClick={() => setActiveWs(w.id)}
            title={w.name}
          >{w.tag}</div>
        ))}
        <div className="cmd__ws-add" title="Add workspace">+</div>
        <div style={{ flex:1 }} />
        <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'rgba(244,235,216,0.4)', writingMode:'vertical-rl', transform:'rotate(180deg)', letterSpacing:'0.2em' }}>
          MANDATE
        </div>
      </div>

      {/* Channel sidebar */}
      <aside className="cmd__side">
        <div className="cmd__side-hd">
          <div className="cmd__side-ws">{CMD_WORKSPACES.find(w => w.id === activeWs).name}</div>
          <div className="cmd__side-ws-sub">47 members · 3 online now</div>
        </div>
        <div className="cmd__side-search">
          <input placeholder="Search channels, DMs, files…" />
        </div>
        <div className="cmd__side-list">
          {CMD_GROUPS.map(g => (
            <div key={g.id} className="cmd__group">
              <div className="cmd__group-lbl">{g.label}</div>
              {g.items.map(it => (
                <CmdItem
                  key={it.id}
                  it={it}
                  active={it.id === activeCh}
                  onClick={() => setActiveCh(it.id)}
                />
              ))}
            </div>
          ))}
        </div>
        <div className="cmd__side-you">
          <div className="cmd__side-you-av">MR</div>
          <div>
            <div className="cmd__side-you-name">Maya Rios</div>
            <div className="cmd__side-you-status">● Active · chief of staff</div>
          </div>
        </div>
      </aside>

      {/* Main panel */}
      <main className="cmd__main">
        <div className="cmd__main-hd">
          <div className="cmd__main-hd-title">
            <span className="hash">#</span>
            <span>war-room</span>
          </div>
          <div className="cmd__main-hd-topic">
            Topic · Live tactical channel. Rapid response. On-the-record here by default — redact at end of day. 24 members · last active 23s ago.
          </div>
          <div className="cmd__main-hd-actions">
            <button className="cmd__main-hd-btn">📌 Pins <span style={{ opacity:0.6 }}>3</span></button>
            <button className="cmd__main-hd-btn">📎 Files</button>
            <button className="cmd__main-hd-btn cmd__main-hd-btn--accent">/ POLL</button>
            <button className="cmd__main-hd-btn cmd__main-hd-btn--huddle">🎙 HUDDLE</button>
          </div>
        </div>

        <div className="cmd__pinned">
          <span className="pin-icon">📌</span>
          <span className="pin-body">"Market vs. neighbours" is the agreed frame for today. Don't debate Vance's words — reframe them.</span>
          <span style={{ fontFamily:'var(--font-mono)', fontSize:10, opacity:0.7 }}>pinned by @Dex · 08:24</span>
        </div>

        <div className="huddle-strip">
          <span style={{ fontSize:14 }}>🎙</span>
          <span>LIVE · war room huddle</span>
          <div className="av-stack">
            <span>DT</span><span>MC</span><span>BO</span><span>PS</span><span>+2</span>
          </div>
          <span style={{ opacity:0.85 }}>Dex is speaking</span>
          <span className="huddle-live">JOIN</span>
        </div>

        <div className="cmd__stream" ref={streamRef}>
          <div className="cmd__day-sep"><span className="cmd__day-sep-lbl">Today · Monday, April 14</span></div>
          {CMD_MESSAGES.map(m => (
            <Msg key={m.id} m={m} onThread={setThreadRoot} />
          ))}
        </div>

        <Composer channelName="war-room" />
      </main>

      {/* Thread pane */}
      {threadRoot && <ThreadPane root={threadRoot} onClose={() => setThreadRoot(null)} />}
    </div>
  );
}

export { Command };
