import { useRef, useState } from 'react';
import './flipbook.css';

// Mandate 2.0 — Flipbook v2: data-as-illustration tableaux (Hungarian infographic style).
// Single rich annotated page per scene. Warm paper, ink, one accent. Hand-drawn SVG landmarks.
// Address-bar header, rounded bordered frame, title plaque, corner crests, bottom fact strip.

const FB_PAGES = [
  // 1 — MERIDIAN WEST: THE HEART OF THE RIDING
  {
    key: 'riding',
    title: 'Meridian West: The Heart of the Riding',
    session: 'Continue this session',
    flag: 'meridian',
    accent: '#6b2e2e',
    foot: 'Population 58,412  |  Eligible Voters 42,810  |  Polling Districts 142',
    render: RidingPage,
  },
  {
    key: 'universe',
    title: 'Universe 31-B: Fourteen Hundred Doors',
    session: 'Continue this session',
    flag: 'universe',
    accent: '#1e2540',
    foot: 'Doors in universe 1,420  |  Support model  0.61  |  Canvassers on block 12',
    render: UniversePage,
  },
  {
    key: 'voter',
    title: 'Jun Nakamura: Apartment 412',
    session: 'Continue this session',
    flag: 'voter',
    accent: '#3a5a3a',
    foot: 'Renter, 9 years in-riding  |  Ballot history 2/6  |  Support 0.78',
    render: VoterPage,
  },
  {
    key: 'bill',
    title: 'Bill 14: The Residential Tenancy Amendment',
    session: 'Continue this session',
    flag: 'bc',
    accent: '#1e2540',
    foot: 'Second reading today, 14:30  |  Whip hard yes  |  46 yea · 2 soft · 0 nay',
    render: BillPage,
  },
  {
    key: 'chamber',
    title: 'The Assembly: A Second Reading',
    session: 'Continue this session',
    flag: 'bc',
    accent: '#6b2e2e',
    foot: "Seats 87  |  Speaker's chair at centre  |  Gallery open to public",
    render: ChamberPage,
  },
  {
    key: 'rally',
    title: 'Metrotown Square: The Rally',
    session: 'Continue this session',
    flag: 'meridian',
    accent: '#a86a20',
    foot: 'Saturday 11:00 AM  |  RSVPs 2,247  |  Forecast 18°C, clear',
    render: RallyPage,
  },
];

// ── Flag / crest SVGs for the corners
function Crest({ kind }) {
  if (kind === 'meridian') return (
    <svg viewBox="0 0 60 40" width="60" height="40">
      <rect x="1" y="1" width="58" height="38" fill="#fff" stroke="#1a1814" strokeWidth="1"/>
      <rect x="1" y="1" width="58" height="13" fill="#6b2e2e"/>
      <rect x="1" y="26" width="58" height="13" fill="#1e4d2f"/>
      <circle cx="30" cy="20" r="5" fill="#f4c65a" stroke="#1a1814" strokeWidth="0.5"/>
      <text x="30" y="22.5" textAnchor="middle" fill="#1a1814" fontSize="5" fontFamily="serif">MW</text>
    </svg>
  );
  if (kind === 'bc') return (
    <svg viewBox="0 0 60 40" width="60" height="40">
      <rect x="1" y="1" width="58" height="38" fill="#fff" stroke="#1a1814" strokeWidth="1"/>
      <rect x="1" y="1" width="58" height="10" fill="#1e2540"/>
      <path d="M 1 11 L 59 11 L 59 20 L 30 24 L 1 20 Z" fill="#c9bfa8"/>
      <path d="M 1 20 L 30 24 L 59 20 L 59 39 L 1 39 Z" fill="#6b2e2e"/>
      <circle cx="30" cy="20" r="4" fill="#f4c65a" stroke="#1a1814" strokeWidth="0.4"/>
    </svg>
  );
  if (kind === 'universe') return (
    <svg viewBox="0 0 60 40" width="60" height="40">
      <rect x="1" y="1" width="58" height="38" fill="#1e2540" stroke="#1a1814" strokeWidth="1"/>
      <text x="30" y="18" textAnchor="middle" fill="#f4c65a" fontSize="8" fontFamily="monospace" letterSpacing="0.1em">31-B</text>
      <line x1="10" y1="22" x2="50" y2="22" stroke="#d9b467" strokeWidth="0.6"/>
      <text x="30" y="32" textAnchor="middle" fill="#d9b467" fontSize="5" fontFamily="monospace" letterSpacing="0.25em">UNIVERSE</text>
    </svg>
  );
  if (kind === 'voter') return (
    <svg viewBox="0 0 60 40" width="60" height="40">
      <rect x="1" y="1" width="58" height="38" fill="#fff" stroke="#1a1814" strokeWidth="1"/>
      <circle cx="30" cy="18" r="8" fill="#c9bfa8" stroke="#1a1814" strokeWidth="0.6"/>
      <path d="M 18 36 Q 30 26 42 36 Z" fill="#c9bfa8" stroke="#1a1814" strokeWidth="0.6"/>
      <text x="30" y="6" textAnchor="middle" fill="#1a1814" fontSize="3" fontFamily="monospace" letterSpacing="0.2em">FILE</text>
    </svg>
  );
  return null;
}

// ─── Illustrated ornaments used across pages
function Parliament({ x, y, s = 1 }) {
  // Canadian-ish parliament silhouette, hand-drawn line style
  return (
    <g transform={`translate(${x},${y}) scale(${s})`}>
      <rect x="0" y="40" width="200" height="40" fill="#c9bfa8" stroke="#1a1814" strokeWidth="1"/>
      <rect x="20" y="20" width="50" height="60" fill="#d4caae" stroke="#1a1814" strokeWidth="1"/>
      <rect x="130" y="20" width="50" height="60" fill="#d4caae" stroke="#1a1814" strokeWidth="1"/>
      <path d="M 80 40 L 80 20 Q 100 -5 120 20 L 120 40 Z" fill="#b5a887" stroke="#1a1814" strokeWidth="1"/>
      <rect x="98" y="-10" width="4" height="20" fill="#1a1814"/>
      <circle cx="100" cy="-12" r="3" fill="#f4c65a" stroke="#1a1814" strokeWidth="0.6"/>
      {/* windows */}
      {Array.from({length: 3}).map((_,i) => (
        <rect key={i} x={30 + i*12} y={35} width="6" height="14" fill="#1a1814" opacity="0.6"/>
      ))}
      {Array.from({length: 3}).map((_,i) => (
        <rect key={i} x={140 + i*12} y={35} width="6" height="14" fill="#1a1814" opacity="0.6"/>
      ))}
      <rect x="92" y="50" width="16" height="26" fill="#6b2e2e"/>
      {/* ground shadow */}
      <ellipse cx="100" cy="85" rx="110" ry="4" fill="#1a1814" opacity="0.15"/>
    </g>
  );
}

function PortraitMarcus({ x, y, s = 1 }) {
  return (
    <g transform={`translate(${x},${y}) scale(${s})`}>
      {/* frame */}
      <rect x="-4" y="-4" width="108" height="128" fill="#efe5d0" stroke="#1a1814" strokeWidth="1"/>
      <rect x="-8" y="-8" width="116" height="136" fill="none" stroke="#1a1814" strokeWidth="0.6"/>
      {/* bg */}
      <rect x="0" y="0" width="100" height="120" fill="#c9bfa8"/>
      {/* figure */}
      <path d="M 10 120 Q 10 80 50 76 Q 90 80 90 120 Z" fill="#3a5a3a" stroke="#1a1814" strokeWidth="0.8"/>
      {/* collar */}
      <path d="M 38 82 L 50 98 L 62 82" fill="#f4ead8" stroke="#1a1814" strokeWidth="0.6"/>
      {/* head */}
      <ellipse cx="50" cy="50" rx="18" ry="22" fill="#e0cdae" stroke="#1a1814" strokeWidth="0.8"/>
      {/* hair */}
      <path d="M 32 42 Q 36 28 50 26 Q 64 28 68 42 L 68 50 Q 60 38 50 38 Q 40 38 32 50 Z" fill="#2a2620" stroke="#1a1814" strokeWidth="0.6"/>
      {/* glasses */}
      <circle cx="42" cy="50" r="4" fill="none" stroke="#1a1814" strokeWidth="0.8"/>
      <circle cx="58" cy="50" r="4" fill="none" stroke="#1a1814" strokeWidth="0.8"/>
      <line x1="46" y1="50" x2="54" y2="50" stroke="#1a1814" strokeWidth="0.8"/>
      {/* mouth */}
      <path d="M 45 62 Q 50 64 55 62" fill="none" stroke="#1a1814" strokeWidth="0.8"/>
      {/* nameplate */}
      <rect x="10" y="100" width="80" height="16" fill="#1a1814"/>
      <text x="50" y="111" textAnchor="middle" fill="#f4c65a" fontSize="7" fontFamily="serif" fontStyle="italic">Marcus Hale, MLA</text>
    </g>
  );
}

// ─── Page 1: Riding map
function RidingPage() {
  return (
    <svg className="fb-svg" viewBox="0 0 1400 700" preserveAspectRatio="xMidYMid meet">
      {/* soft paper grain */}
      <rect width="1400" height="700" fill="#f1ead8"/>

      {/* compass rose */}
      <g transform="translate(80, 600)">
        <circle r="22" fill="none" stroke="#1a1814" strokeWidth="0.8"/>
        <path d="M 0 -20 L 3 0 L 0 20 L -3 0 Z" fill="#1a1814"/>
        <path d="M -20 0 L 0 3 L 20 0 L 0 -3 Z" fill="none" stroke="#1a1814" strokeWidth="0.6"/>
        <text x="0" y="-26" textAnchor="middle" fill="#1a1814" fontSize="9" fontFamily="serif" fontStyle="italic">N</text>
      </g>

      {/* Parliament illustration top-left */}
      <Parliament x={140} y={120} s={0.9} />
      <text x="230" y="260" textAnchor="middle" fill="#1a1814" fontSize="12" fontFamily="serif" fontStyle="italic">
        Legislature at Victoria
      </text>
      <text x="230" y="277" textAnchor="middle" fill="#6b2e2e" fontSize="10" fontFamily="serif">
        seat 47 · Official Opposition
      </text>

      {/* Portrait top-right */}
      <PortraitMarcus x={1180} y={110} s={0.95} />

      {/* The map — Meridian West riding, stylized outline */}
      <g transform="translate(420, 100)">
        {/* outline of the riding */}
        <path
          d="M 80 20 Q 180 10 280 30 L 460 60 Q 520 80 520 180 L 500 320 Q 480 420 360 440 L 200 430 Q 80 410 60 300 L 50 180 Q 50 60 80 20 Z"
          fill="#fff" stroke="#1a1814" strokeWidth="1.5" strokeLinejoin="round"
        />
        {/* neighborhood subdivisions */}
        <path d="M 80 20 Q 220 90 300 220 L 460 240" fill="none" stroke="#1a1814" strokeWidth="0.5" opacity="0.5"/>
        <path d="M 60 220 L 300 220" fill="none" stroke="#1a1814" strokeWidth="0.5" opacity="0.5"/>
        <path d="M 300 220 L 360 440" fill="none" stroke="#1a1814" strokeWidth="0.5" opacity="0.5"/>

        {/* rivers — blue flowing lines */}
        <path d="M 80 100 Q 180 140 240 200 Q 300 260 380 280 Q 460 300 520 280" fill="none" stroke="#6b8fa8" strokeWidth="2.5" opacity="0.75"/>
        <path d="M 80 100 Q 180 140 240 200 Q 300 260 380 280 Q 460 300 520 280" fill="none" stroke="#a3c4dc" strokeWidth="1" opacity="0.8"/>

        {/* green forested area — dots and mound clusters */}
        {Array.from({length: 40}).map((_,i) => {
          const cx = 120 + Math.random() * 120;
          const cy = 50 + Math.random() * 80;
          return (
            <g key={i}>
              <circle cx={cx} cy={cy} r={2 + Math.random() * 2} fill="#3a5a3a" opacity={0.45 + Math.random()*0.3}/>
            </g>
          );
        })}

        {/* urban dots — buildings representing Metrotown */}
        <g transform="translate(220, 250)">
          <rect x="0" y="-20" width="12" height="20" fill="#c9bfa8" stroke="#1a1814" strokeWidth="0.6"/>
          <rect x="14" y="-28" width="10" height="28" fill="#c9bfa8" stroke="#1a1814" strokeWidth="0.6"/>
          <rect x="26" y="-16" width="14" height="16" fill="#c9bfa8" stroke="#1a1814" strokeWidth="0.6"/>
          <rect x="42" y="-24" width="10" height="24" fill="#c9bfa8" stroke="#1a1814" strokeWidth="0.6"/>
          <rect x="54" y="-18" width="12" height="18" fill="#c9bfa8" stroke="#1a1814" strokeWidth="0.6"/>
        </g>

        {/* 31-B polling universe marker */}
        <g transform="translate(260, 250)">
          <circle r="36" fill="#f4c65a" opacity="0.3"/>
          <circle r="36" fill="none" stroke="#6b2e2e" strokeWidth="1" strokeDasharray="3 3"/>
          <circle r="5" fill="#6b2e2e"/>
          {/* tag */}
          <line x1="5" y1="-5" x2="40" y2="-60" stroke="#1a1814" strokeWidth="0.8"/>
          <rect x="40" y="-74" width="140" height="30" fill="#fff" stroke="#1a1814" strokeWidth="0.8"/>
          <text x="48" y="-61" fill="#6b2e2e" fontSize="10" fontFamily="serif" fontWeight="600">Universe 31-B</text>
          <text x="48" y="-51" fill="#1a1814" fontSize="9" fontFamily="serif" fontStyle="italic">Metrotown East · 1,420 doors</text>
        </g>

        {/* rally pin */}
        <g transform="translate(180, 280)">
          <circle r="5" fill="#a86a20" stroke="#1a1814" strokeWidth="0.6"/>
          <path d="M 0 -5 L 0 -24 Q -4 -28 0 -32 Q 4 -28 0 -24" fill="#a86a20" stroke="#1a1814" strokeWidth="0.6"/>
          <text x="-6" y="-40" textAnchor="end" fill="#1a1814" fontSize="10" fontFamily="serif" fontStyle="italic">Metrotown Sq.</text>
          <text x="-6" y="-28" textAnchor="end" fill="#a86a20" fontSize="9" fontFamily="serif">rally Sat 11:00</text>
        </g>

        {/* neighborhood labels */}
        <text x="140" y="150" fill="#1a1814" fontSize="11" fontFamily="serif" fontStyle="italic" opacity="0.7">Hillcrest</text>
        <text x="350" y="140" fill="#1a1814" fontSize="11" fontFamily="serif" fontStyle="italic" opacity="0.7">North Slope</text>
        <text x="140" y="380" fill="#1a1814" fontSize="11" fontFamily="serif" fontStyle="italic" opacity="0.7">Waterfront</text>
        <text x="400" y="380" fill="#1a1814" fontSize="11" fontFamily="serif" fontStyle="italic" opacity="0.7">Fairview</text>

        {/* ornament label */}
        <text x="290" y="30" textAnchor="middle" fill="#1a1814" fontSize="14" fontFamily="serif" fontStyle="italic" letterSpacing="0.15em">MERIDIAN WEST</text>
      </g>

      {/* bottom-left ornament: founding */}
      <g transform="translate(180, 470)">
        <text x="0" y="0" fill="#1a1814" fontSize="13" fontFamily="serif" fontStyle="italic">Founded 1871</text>
        <text x="0" y="20" fill="#1a1814" fontSize="11" fontFamily="serif">as a federal riding on the</text>
        <text x="0" y="35" fill="#1a1814" fontSize="11" fontFamily="serif">western slope of the Fraser.</text>
      </g>

      {/* bottom-right ornament: flag of issues */}
      <g transform="translate(1100, 460)">
        <text x="60" y="0" textAnchor="middle" fill="#1a1814" fontSize="12" fontFamily="serif" fontStyle="italic">Top issues</text>
        <g transform="translate(0,14)">
          {[
            ['Housing', 0.42, '#6b2e2e'],
            ['Transit', 0.24, '#1e4d2f'],
            ['Climate', 0.18, '#3a5a3a'],
          ].map(([lab, v, c], i) => (
            <g key={lab} transform={`translate(0, ${i*20})`}>
              <rect x="0" y="0" width="120" height="12" fill="#fff" stroke="#1a1814" strokeWidth="0.5"/>
              <rect x="0" y="0" width={120*v} height="12" fill={c}/>
              <text x="126" y="10" fill="#1a1814" fontSize="10" fontFamily="serif">{lab}</text>
            </g>
          ))}
        </g>
      </g>

      {/* invisible hint — "click the highlighted universe to zoom in" */}
    </svg>
  );
}

// ─── Page 2: Universe 31-B
function UniversePage() {
  return (
    <svg className="fb-svg" viewBox="0 0 1400 700" preserveAspectRatio="xMidYMid meet">
      <rect width="1400" height="700" fill="#f1ead8"/>

      {/* title ornament */}
      <text x="700" y="60" textAnchor="middle" fill="#1a1814" fontSize="12" fontFamily="serif" fontStyle="italic" letterSpacing="0.2em">14 BLOCKS · 1,420 DOORS · 12 CANVASSERS ON THE GROUND</text>

      {/* left: isometric block of apartments */}
      <g transform="translate(140, 160)">
        <text x="0" y="-10" fill="#1a1814" fontSize="13" fontFamily="serif" fontStyle="italic">The Block on Napier St.</text>
        {/* isometric block */}
        <g>
          {/* side wall */}
          <path d="M 0 60 L 0 340 L 240 380 L 240 100 Z" fill="#c9bfa8" stroke="#1a1814" strokeWidth="0.8"/>
          {/* front */}
          <path d="M 240 100 L 240 380 L 440 360 L 440 60 Z" fill="#d4caae" stroke="#1a1814" strokeWidth="0.8"/>
          {/* roof */}
          <path d="M 0 60 L 240 100 L 440 60 L 200 20 Z" fill="#8a7c5f" stroke="#1a1814" strokeWidth="0.8"/>
          {/* windows — grid, one highlighted */}
          {Array.from({length: 7}).map((_, row) =>
            Array.from({length: 6}).map((_, col) => {
              const x = 260 + col * 28;
              const y = 130 + row * 32;
              const isTarget = row === 3 && col === 2;
              return (
                <g key={`w-${row}-${col}`}>
                  <rect x={x} y={y} width="16" height="20" fill={isTarget ? '#f4c65a' : '#2a2620'} opacity={isTarget ? 1 : 0.85}/>
                  {isTarget && (
                    <rect x={x-3} y={y-3} width="22" height="26" fill="none" stroke="#6b2e2e" strokeWidth="1.2" strokeDasharray="2 2"/>
                  )}
                </g>
              );
            })
          )}
          {/* apt 412 tag */}
          <g transform="translate(330, 225)">
            <line x1="0" y1="-10" x2="100" y2="-80" stroke="#1a1814" strokeWidth="0.8"/>
            <rect x="96" y="-100" width="170" height="40" fill="#fff" stroke="#1a1814" strokeWidth="0.8"/>
            <text x="104" y="-85" fill="#6b2e2e" fontSize="11" fontFamily="serif" fontWeight="700">Apt 412</text>
            <text x="104" y="-73" fill="#1a1814" fontSize="10" fontFamily="serif" fontStyle="italic">J. Nakamura · renter 9y</text>
            <text x="104" y="-62" fill="#1a1814" fontSize="9" fontFamily="serif">support 0.78 · Bill 14 receptive</text>
          </g>
          {/* awning */}
          <rect x="320" y="360" width="50" height="4" fill="#6b2e2e"/>
        </g>
      </g>

      {/* right: canvassers on a map */}
      <g transform="translate(720, 160)">
        <text x="0" y="-10" fill="#1a1814" fontSize="13" fontFamily="serif" fontStyle="italic">The block tonight, 18:47</text>
        {/* mini street grid */}
        <rect x="0" y="0" width="540" height="400" fill="#fff" stroke="#1a1814" strokeWidth="0.8"/>
        {/* streets */}
        {[100, 200, 300].map(y => <line key={y} x1="0" y1={y} x2="540" y2={y} stroke="#c9bfa8" strokeWidth="10"/>)}
        {[120, 260, 400].map(x => <line key={x} x1={x} y1="0" x2={x} y2="400" stroke="#c9bfa8" strokeWidth="10"/>)}
        {/* street names */}
        <text x="10" y="96" fill="#1a1814" fontSize="8" fontFamily="serif" fontStyle="italic">Napier St.</text>
        <text x="124" y="14" fill="#1a1814" fontSize="8" fontFamily="serif" fontStyle="italic" transform="rotate(90 124 14)">E 14th Ave.</text>
        {/* buildings */}
        {Array.from({length: 18}).map((_, i) => {
          const bx = [20, 50, 80, 135, 170, 210, 275, 310, 345, 410, 440, 470][i % 12];
          const by = [20, 65, 115, 165, 220, 270, 320, 360][i % 8];
          return <rect key={i} x={bx} y={by} width="22" height="18" fill="#d4caae" stroke="#1a1814" strokeWidth="0.5"/>;
        })}
        {/* canvasser dots — tiny figures */}
        {[
          {x: 80, y: 45, status: 'on'},
          {x: 220, y: 150, status: 'on'},
          {x: 200, y: 85, status: 'done'},
          {x: 360, y: 170, status: 'on'},
          {x: 430, y: 240, status: 'done'},
          {x: 130, y: 280, status: 'on'},
          {x: 320, y: 340, status: 'refused'},
          {x: 480, y: 320, status: 'on'},
          {x: 75, y: 220, status: 'done'},
          {x: 275, y: 60, status: 'on'},
          {x: 400, y: 75, status: 'on'},
          {x: 145, y: 370, status: 'on'},
        ].map((c, i) => (
          <g key={i} transform={`translate(${c.x}, ${c.y})`}>
            <circle r="5" fill={c.status === 'refused' ? '#6b2e2e' : c.status === 'done' ? '#3a5a3a' : '#1e2540'}/>
            <circle r="2" cx="0" cy="-4" fill={c.status === 'refused' ? '#6b2e2e' : c.status === 'done' ? '#3a5a3a' : '#1e2540'}/>
          </g>
        ))}
        {/* highlight the door on Napier */}
        <g transform="translate(92, 52)">
          <circle r="14" fill="none" stroke="#f4c65a" strokeWidth="2"/>
          <circle r="20" fill="none" stroke="#f4c65a" strokeWidth="1" strokeDasharray="3 3" opacity="0.6"/>
        </g>
        {/* legend */}
        <g transform="translate(0, 430)">
          {[
            ['Knocking', '#1e2540'],
            ['Done', '#3a5a3a'],
            ['Refused', '#6b2e2e'],
          ].map(([lab, c], i) => (
            <g key={lab} transform={`translate(${i*130}, 0)`}>
              <circle r="4" cx="6" cy="0" fill={c}/>
              <text x="18" y="3" fill="#1a1814" fontSize="10" fontFamily="serif" fontStyle="italic">{lab}</text>
            </g>
          ))}
        </g>
      </g>

      {/* ornament bottom: model bar */}
      <g transform="translate(140, 600)">
        <text x="0" y="0" fill="#1a1814" fontSize="11" fontFamily="serif" fontStyle="italic">Universe support model</text>
        <rect x="0" y="8" width="1120" height="14" fill="#fff" stroke="#1a1814" strokeWidth="0.8"/>
        <rect x="0" y="8" width={1120*0.61} height="14" fill="#1e2540"/>
        <text x={1120*0.61 + 6} y="19" fill="#1a1814" fontSize="10" fontFamily="monospace">0.61</text>
        <text x="1120" y="0" textAnchor="end" fill="#1a1814" fontSize="10" fontFamily="serif" fontStyle="italic">target 0.58 · +3pp this week</text>
      </g>
    </svg>
  );
}

// ─── Page 3: Jun Nakamura portrait
function VoterPage() {
  return (
    <svg className="fb-svg" viewBox="0 0 1400 700" preserveAspectRatio="xMidYMid meet">
      <rect width="1400" height="700" fill="#f1ead8"/>

      {/* central portrait — woman, editorial illustrated style */}
      <g transform="translate(700, 360)">
        <rect x="-120" y="-180" width="240" height="320" fill="#efe5d0" stroke="#1a1814" strokeWidth="1.5"/>
        <rect x="-115" y="-175" width="230" height="310" fill="#c9bfa8"/>
        {/* hair */}
        <path d="M -60 -80 Q -75 -160 0 -170 Q 75 -160 60 -80 Q 50 -120 0 -120 Q -50 -120 -60 -80 Z" fill="#2a2620" stroke="#1a1814" strokeWidth="0.8"/>
        {/* face */}
        <ellipse cx="0" cy="-60" rx="45" ry="58" fill="#e0cdae" stroke="#1a1814" strokeWidth="0.8"/>
        {/* hair sides */}
        <path d="M -45 -80 Q -55 -40 -40 20 L -50 24 Q -70 -50 -55 -90 Z" fill="#2a2620" stroke="#1a1814" strokeWidth="0.6"/>
        <path d="M 45 -80 Q 55 -40 40 20 L 50 24 Q 70 -50 55 -90 Z" fill="#2a2620" stroke="#1a1814" strokeWidth="0.6"/>
        {/* eyes */}
        <ellipse cx="-14" cy="-64" rx="4" ry="2" fill="#1a1814"/>
        <ellipse cx="14" cy="-64" rx="4" ry="2" fill="#1a1814"/>
        {/* nose */}
        <path d="M 0 -58 L -4 -40 Q 0 -36 4 -40 Z" fill="none" stroke="#1a1814" strokeWidth="0.6"/>
        {/* mouth */}
        <path d="M -8 -28 Q 0 -24 8 -28" fill="none" stroke="#6b2e2e" strokeWidth="1"/>
        {/* shirt */}
        <path d="M -100 140 Q -70 30 -30 16 L 30 16 Q 70 30 100 140 Z" fill="#6b2e2e" stroke="#1a1814" strokeWidth="0.8"/>
        {/* collar */}
        <path d="M -30 16 L 0 44 L 30 16" fill="#f4ead8" stroke="#1a1814" strokeWidth="0.6"/>
        {/* nameplate */}
        <rect x="-115" y="145" width="230" height="-10" fill="#1a1814"/>
        <rect x="-100" y="110" width="200" height="20" fill="#1a1814"/>
        <text x="0" y="125" textAnchor="middle" fill="#f4c65a" fontSize="12" fontFamily="serif" fontStyle="italic">Jun Nakamura, 44</text>
      </g>

      {/* left: ballot history */}
      <g transform="translate(140, 200)">
        <text x="0" y="0" fill="#1a1814" fontSize="13" fontFamily="serif" fontStyle="italic">Ballot History</text>
        <text x="0" y="16" fill="#1a1814" fontSize="10" fontFamily="serif">Voted 2 of 6 elections. Skipped 2022 & 2024.</text>
        <g transform="translate(0, 30)">
          {['2014','2016','2018','2020','2022','2024'].map((y, i) => {
            const voted = ['2018','2020'].includes(y);
            return (
              <g key={y} transform={`translate(${i*62}, 0)`}>
                <rect x="0" y="0" width="48" height="56" fill={voted ? '#1a1814' : '#fff'} stroke="#1a1814" strokeWidth="1"/>
                <rect x="6" y="10" width="36" height="4" fill={voted ? '#f4c65a' : '#1a1814'} opacity={voted ? 1 : 0.3}/>
                <rect x="6" y="20" width="36" height="4" fill={voted ? '#f4c65a' : '#1a1814'} opacity={voted ? 1 : 0.3}/>
                <circle cx="24" cy="40" r="8" fill={voted ? '#f4c65a' : 'none'} stroke={voted ? '#f4c65a' : '#1a1814'} strokeWidth="1"/>
                {voted && <path d="M 20 40 L 24 44 L 30 36" fill="none" stroke="#1a1814" strokeWidth="1.5"/>}
                <text x="24" y="72" textAnchor="middle" fill="#1a1814" fontSize="10" fontFamily="serif">{y}</text>
              </g>
            );
          })}
        </g>
      </g>

      {/* left bottom: rent notice illustration */}
      <g transform="translate(140, 420)">
        <text x="0" y="0" fill="#1a1814" fontSize="13" fontFamily="serif" fontStyle="italic">Rent Notice, April</text>
        <g transform="translate(0, 14)">
          <rect x="0" y="0" width="180" height="220" fill="#efe5d0" stroke="#1a1814" strokeWidth="1" transform="rotate(-2)"/>
          <g transform="rotate(-2)">
            <text x="12" y="22" fill="#1a1814" fontSize="10" fontFamily="serif" fontStyle="italic">NOTICE OF RENT INCREASE</text>
            <line x1="12" y1="28" x2="160" y2="28" stroke="#1a1814" strokeWidth="0.4"/>
            <text x="12" y="50" fill="#1a1814" fontSize="9" fontFamily="serif">Tenant: J. Nakamura</text>
            <text x="12" y="66" fill="#1a1814" fontSize="9" fontFamily="serif">Current rent: $1,840</text>
            <text x="12" y="90" fill="#6b2e2e" fontSize="14" fontFamily="serif" fontWeight="700">New rent: $2,240</text>
            <text x="12" y="106" fill="#1a1814" fontSize="9" fontFamily="serif" fontStyle="italic">Effective June 1</text>
            <rect x="12" y="120" width="156" height="1" fill="#1a1814" opacity="0.4"/>
            <text x="12" y="140" fill="#1a1814" fontSize="8" fontFamily="serif">+21.7% in one increase.</text>
            <text x="12" y="154" fill="#1a1814" fontSize="8" fontFamily="serif">Above the guideline of 3.5%.</text>
            <text x="12" y="168" fill="#1a1814" fontSize="8" fontFamily="serif" fontStyle="italic">Tenant reply: under review.</text>
            <text x="12" y="198" fill="#6b2e2e" fontSize="9" fontFamily="serif" fontStyle="italic">→ This is why Bill 14 exists</text>
          </g>
        </g>
      </g>

      {/* right top: quote */}
      <g transform="translate(950, 180)">
        <text x="0" y="0" fill="#1a1814" fontSize="13" fontFamily="serif" fontStyle="italic">From Last Night's Canvass</text>
        <g transform="translate(0, 20)">
          <text x="0" y="0" fill="#6b2e2e" fontSize="64" fontFamily="serif">“</text>
          <foreignObject x="28" y="-50" width="320" height="180">
            <div xmlns="http://www.w3.org/1999/xhtml" style={{fontFamily:"'Fraunces', serif", fontSize:"20px", fontStyle:"italic", lineHeight:"1.3", color:"#1a1814"}}>
              Rent's gone up $400 in two years.<br/>Everyone I know is leaving.
            </div>
          </foreignObject>
          <text x="28" y="132" fill="#1a1814" fontSize="10" fontFamily="serif" fontStyle="italic" opacity="0.7">— recorded by canvasser B. Okafor at 18:52</text>
        </g>
      </g>

      {/* right bottom: issue icons */}
      <g transform="translate(950, 440)">
        <text x="0" y="0" fill="#1a1814" fontSize="13" fontFamily="serif" fontStyle="italic">Top Concerns</text>
        {[
          {lab: 'Rent cap', icon: 'house', c: '#6b2e2e', v: 0.92},
          {lab: 'Transit', icon: 'bus', c: '#1e4d2f', v: 0.61},
          {lab: 'Childcare', icon: 'heart', c: '#a86a20', v: 0.44},
        ].map((row, i) => (
          <g key={row.lab} transform={`translate(0, ${20 + i*44})`}>
            <rect x="0" y="0" width="32" height="32" fill="#fff" stroke="#1a1814" strokeWidth="0.8"/>
            {row.icon === 'house' && <path d="M 6 18 L 16 6 L 26 18 L 26 28 L 20 28 L 20 22 L 12 22 L 12 28 L 6 28 Z" fill={row.c}/>}
            {row.icon === 'bus' && <g><rect x="6" y="8" width="20" height="16" fill={row.c}/><circle cx="10" cy="26" r="2" fill="#1a1814"/><circle cx="22" cy="26" r="2" fill="#1a1814"/><rect x="8" y="11" width="6" height="5" fill="#fff"/><rect x="18" y="11" width="6" height="5" fill="#fff"/></g>}
            {row.icon === 'heart' && <path d="M 16 26 L 6 14 Q 6 8 12 8 Q 16 8 16 12 Q 16 8 20 8 Q 26 8 26 14 Z" fill={row.c}/>}
            <text x="42" y="14" fill="#1a1814" fontSize="12" fontFamily="serif">{row.lab}</text>
            <rect x="42" y="18" width="200" height="10" fill="#fff" stroke="#1a1814" strokeWidth="0.5"/>
            <rect x="42" y="18" width={200*row.v} height="10" fill={row.c}/>
          </g>
        ))}
      </g>
    </svg>
  );
}

// ─── Page 4: Bill 14
function BillPage() {
  return (
    <svg className="fb-svg" viewBox="0 0 1400 700" preserveAspectRatio="xMidYMid meet">
      <rect width="1400" height="700" fill="#f1ead8"/>

      {/* the bill — parchment center-left */}
      <g transform="translate(100, 130)">
        <rect x="0" y="0" width="520" height="460" fill="#f8f2e0" stroke="#1a1814" strokeWidth="1.2" transform="rotate(-1.5)"/>
        <g transform="rotate(-1.5)">
          {/* crest */}
          <circle cx="260" cy="40" r="22" fill="none" stroke="#1e2540" strokeWidth="1"/>
          <text x="260" y="46" textAnchor="middle" fill="#1e2540" fontSize="14" fontFamily="serif">BC</text>
          <text x="260" y="82" textAnchor="middle" fill="#1a1814" fontSize="10" fontFamily="serif" fontStyle="italic" letterSpacing="0.2em">
            LEGISLATIVE ASSEMBLY · 43rd PARL
          </text>
          <text x="260" y="114" textAnchor="middle" fill="#1a1814" fontSize="20" fontFamily="serif" letterSpacing="0.2em">
            BILL 14 — 2026
          </text>
          <text x="260" y="148" textAnchor="middle" fill="#1a1814" fontSize="18" fontFamily="serif" fontStyle="italic">
            An Act to Amend the
          </text>
          <text x="260" y="170" textAnchor="middle" fill="#1a1814" fontSize="18" fontFamily="serif" fontStyle="italic">
            Residential Tenancy Act
          </text>
          <line x1="160" y1="190" x2="360" y2="190" stroke="#1a1814" strokeWidth="0.6"/>
          {/* body */}
          <foreignObject x="40" y="210" width="440" height="220">
            <div xmlns="http://www.w3.org/1999/xhtml" style={{fontFamily:"'Source Serif 4', serif", fontSize:"11.5px", lineHeight:"1.5", color:"#1a1814"}}>
              <p style={{fontStyle:"italic",marginBottom:"10px"}}>HER MAJESTY, by and with the advice and consent of the Legislative Assembly of the Province of British Columbia, enacts as follows:</p>
              <p style={{marginBottom:"8px"}}><strong style={{fontFamily:"'Fraunces',serif",fontSize:"14px",fontStyle:"italic"}}>1.</strong> &nbsp; Section 43 of the <em>Residential Tenancy Act</em>, R.S.B.C. 2002, c. 78, is amended by striking out the annual maximum rent increase of 3.5% and substituting <mark style={{background:"#f4c65a",padding:"0 2px"}}>the consumer price index, not to exceed 2.0%</mark>, in any twelve-month period.</p>
              <p style={{marginBottom:"8px"}}><strong style={{fontFamily:"'Fraunces',serif",fontSize:"14px",fontStyle:"italic"}}>2.</strong> &nbsp; No landlord may apply for an above-guideline increase more than once every <u>three years</u>…</p>
            </div>
          </foreignObject>
          {/* signature */}
          <text x="380" y="430" fill="#6b2e2e" fontSize="16" fontFamily="serif" fontStyle="italic">M. Hale</text>
          <line x1="360" y1="440" x2="460" y2="440" stroke="#1a1814" strokeWidth="0.4"/>
          <text x="410" y="452" textAnchor="middle" fill="#1a1814" fontSize="9" fontFamily="serif" fontStyle="italic">sponsor</text>
        </g>
      </g>

      {/* right: whip count rosette */}
      <g transform="translate(780, 150)">
        <text x="170" y="0" textAnchor="middle" fill="#1a1814" fontSize="14" fontFamily="serif" fontStyle="italic">Whip Count · 14:12</text>
        {/* donut — simple */}
        <g transform="translate(170, 120)">
          <circle r="70" fill="none" stroke="#efe5d0" strokeWidth="24"/>
          {/* 46 yea, 2 soft, 0 nay of 48 caucus */}
          <circle r="70" fill="none" stroke="#1e4d2f" strokeWidth="24"
            strokeDasharray={`${(46/48) * 2 * Math.PI * 70} ${2 * Math.PI * 70}`}
            transform="rotate(-90)"/>
          <circle r="70" fill="none" stroke="#a86a20" strokeWidth="24"
            strokeDasharray={`${(2/48) * 2 * Math.PI * 70} ${2 * Math.PI * 70}`}
            strokeDashoffset={-(46/48) * 2 * Math.PI * 70}
            transform="rotate(-90)"/>
          <text x="0" y="-4" textAnchor="middle" fill="#1a1814" fontSize="32" fontFamily="serif" fontStyle="italic">48</text>
          <text x="0" y="16" textAnchor="middle" fill="#1a1814" fontSize="10" fontFamily="serif">caucus</text>
        </g>
        <g transform="translate(40, 220)">
          {[
            {lab:'Hard yes', n:'46', c:'#1e4d2f'},
            {lab:'Soft',     n:'2',  c:'#a86a20'},
            {lab:'No',       n:'0',  c:'#6b2e2e'},
          ].map((r, i) => (
            <g key={r.lab} transform={`translate(${i*95}, 0)`}>
              <rect x="0" y="0" width="8" height="22" fill={r.c}/>
              <text x="16" y="12" fill="#1a1814" fontSize="10" fontFamily="serif">{r.lab}</text>
              <text x="16" y="26" fill="#1a1814" fontSize="16" fontFamily="serif" fontStyle="italic">{r.n}</text>
            </g>
          ))}
        </g>

        {/* wavering MLAs */}
        <g transform="translate(0, 290)">
          <text x="170" y="0" textAnchor="middle" fill="#1a1814" fontSize="13" fontFamily="serif" fontStyle="italic">Wavering</text>
          {[
            {name: 'Wong, L.', riding: 'Kamloops South', status: 'soft no'},
            {name: 'Desai, A.', riding: 'Surrey Centre', status: 'soft yes'},
          ].map((m, i) => (
            <g key={m.name} transform={`translate(40, ${24 + i*60})`}>
              <circle cx="16" cy="16" r="16" fill="#c9bfa8" stroke="#1a1814" strokeWidth="0.8"/>
              <circle cx="16" cy="12" r="6" fill="#e0cdae" stroke="#1a1814" strokeWidth="0.5"/>
              <path d="M 4 30 Q 16 22 28 30 L 28 32 L 4 32 Z" fill="#e0cdae" stroke="#1a1814" strokeWidth="0.5"/>
              <text x="40" y="12" fill="#1a1814" fontSize="12" fontFamily="serif" fontStyle="italic">{m.name}</text>
              <text x="40" y="24" fill="#1a1814" fontSize="10" fontFamily="serif">{m.riding}</text>
              <text x="40" y="36" fill="#a86a20" fontSize="10" fontFamily="serif" fontStyle="italic">{m.status}</text>
            </g>
          ))}
        </g>
      </g>
    </svg>
  );
}

// ─── Page 5: The Chamber — architectural cutaway
function ChamberPage() {
  return (
    <svg className="fb-svg" viewBox="0 0 1400 700" preserveAspectRatio="xMidYMid meet">
      <rect width="1400" height="700" fill="#f1ead8"/>

      {/* chamber cross-section */}
      <g transform="translate(240, 90)">
        {/* outer building */}
        <path d="M 0 520 L 0 140 Q 460 -30 920 140 L 920 520 Z" fill="#d4caae" stroke="#1a1814" strokeWidth="1.5"/>
        {/* dome */}
        <path d="M 300 160 Q 460 -10 620 160" fill="#c9bfa8" stroke="#1a1814" strokeWidth="1"/>
        <path d="M 340 150 Q 460 30 580 150" fill="none" stroke="#1a1814" strokeWidth="0.5" opacity="0.5"/>
        <path d="M 380 140 Q 460 60 540 140" fill="none" stroke="#1a1814" strokeWidth="0.5" opacity="0.5"/>
        {/* cupola */}
        <rect x="450" y="-20" width="20" height="30" fill="#1a1814"/>
        <circle cx="460" cy="-22" r="3" fill="#f4c65a" stroke="#1a1814" strokeWidth="0.4"/>

        {/* inside the chamber — floor and benches */}
        <rect x="60" y="300" width="800" height="220" fill="#f8f2e0" stroke="#1a1814" strokeWidth="0.8"/>
        <path d="M 60 300 L 860 300 L 860 520 L 60 520 Z" fill="url(#chamber-floor)"/>

        {/* speaker's dais — back center */}
        <rect x="420" y="310" width="80" height="40" fill="#6b2e2e" stroke="#1a1814" strokeWidth="0.8"/>
        <rect x="440" y="285" width="40" height="30" fill="#8a3a3a" stroke="#1a1814" strokeWidth="0.6"/>
        <text x="460" y="270" textAnchor="middle" fill="#1a1814" fontSize="9" fontFamily="serif" fontStyle="italic">Speaker</text>

        {/* government benches — left */}
        {Array.from({length: 4}).map((_, ring) => (
          <g key={`gov-${ring}`}>
            <rect x={90 + ring*20} y={360 + ring*36} width={300 - ring*20} height="8" fill="#8a7c5f" stroke="#1a1814" strokeWidth="0.5"/>
            {Array.from({length: 10 - ring}).map((_, i) => {
              const x = 110 + ring*20 + i*28;
              const isFilled = true;
              return (
                <g key={i}>
                  <rect x={x} y={344 + ring*36} width="20" height="16" fill="#3a2418" stroke="#1a1814" strokeWidth="0.4"/>
                  {isFilled && <circle cx={x+10} cy={348 + ring*36} r="4" fill="#c9bfa8" stroke="#1a1814" strokeWidth="0.4"/>}
                </g>
              );
            })}
          </g>
        ))}

        {/* opposition benches — right */}
        {Array.from({length: 4}).map((_, ring) => (
          <g key={`opp-${ring}`}>
            <rect x={530 + ring*20} y={360 + ring*36} width={300 - ring*20} height="8" fill="#8a7c5f" stroke="#1a1814" strokeWidth="0.5"/>
            {Array.from({length: 10 - ring}).map((_, i) => {
              const x = 550 + ring*20 + i*28;
              const isMarcus = ring === 1 && i === 3;
              return (
                <g key={i}>
                  <rect x={x} y={344 + ring*36} width="20" height="16" fill={isMarcus ? '#f4c65a' : '#3a2418'} stroke="#1a1814" strokeWidth="0.4"/>
                  <circle cx={x+10} cy={348 + ring*36} r="4" fill={isMarcus ? '#3a5a3a' : '#c9bfa8'} stroke="#1a1814" strokeWidth="0.4"/>
                  {isMarcus && (
                    <g>
                      <line x1={x+10} y1={332 + ring*36} x2={x+10} y2={270} stroke="#6b2e2e" strokeWidth="0.8"/>
                      <rect x={x-30} y="244" width="90" height="22" fill="#fff" stroke="#1a1814" strokeWidth="0.8"/>
                      <text x={x+14} y="258" textAnchor="middle" fill="#6b2e2e" fontSize="9" fontFamily="serif" fontStyle="italic" fontWeight="700">13:50 · Marcus</text>
                      <text x={x+14} y="269" textAnchor="middle" fill="#1a1814" fontSize="7" fontFamily="serif">sponsor of Bill 14</text>
                    </g>
                  )}
                </g>
              );
            })}
          </g>
        ))}

        {/* mace */}
        <g transform="translate(460, 490)">
          <rect x="-2" y="-20" width="4" height="24" fill="#a86a20"/>
          <circle cx="0" cy="-22" r="4" fill="#f4c65a" stroke="#1a1814" strokeWidth="0.4"/>
          <text x="0" y="18" textAnchor="middle" fill="#1a1814" fontSize="8" fontFamily="serif" fontStyle="italic">the Mace</text>
        </g>

        {/* press gallery up top */}
        <g transform="translate(70, 140)">
          <rect x="0" y="0" width="780" height="36" fill="#c9bfa8" stroke="#1a1814" strokeWidth="0.5"/>
          <text x="390" y="-6" textAnchor="middle" fill="#1a1814" fontSize="9" fontFamily="serif" fontStyle="italic">Press Gallery</text>
          {Array.from({length: 20}).map((_, i) => (
            <g key={i} transform={`translate(${20 + i*38}, 12)`}>
              <circle r="5" fill="#3a2418" stroke="#1a1814" strokeWidth="0.4"/>
              <rect x="-6" y="5" width="12" height="14" fill="#3a2418" stroke="#1a1814" strokeWidth="0.4"/>
            </g>
          ))}
        </g>

        {/* title */}
        <text x="460" y="550" textAnchor="middle" fill="#1a1814" fontSize="12" fontFamily="serif" fontStyle="italic" letterSpacing="0.25em">
          LEGISLATIVE CHAMBER · VICTORIA
        </text>
      </g>

      {/* annotations */}
      <g transform="translate(60, 260)">
        <line x1="190" y1="0" x2="260" y2="70" stroke="#1a1814" strokeWidth="0.5"/>
        <text x="0" y="0" fill="#1a1814" fontSize="12" fontFamily="serif" fontStyle="italic">Speaker's dais</text>
        <text x="0" y="14" fill="#1a1814" fontSize="10" fontFamily="serif">Presides over debate</text>
      </g>
      <g transform="translate(1080, 280)">
        <line x1="0" y1="0" x2="-90" y2="90" stroke="#1a1814" strokeWidth="0.5"/>
        <text x="0" y="0" fill="#6b2e2e" fontSize="12" fontFamily="serif" fontStyle="italic">Marcus, seat 47</text>
        <text x="0" y="14" fill="#1a1814" fontSize="10" fontFamily="serif">Official Opposition</text>
        <text x="0" y="28" fill="#1a1814" fontSize="10" fontFamily="serif">Speaks at 13:50</text>
      </g>
    </svg>
  );
}

// ─── Page 6: Rally
function RallyPage() {
  return (
    <svg className="fb-svg" viewBox="0 0 1400 700" preserveAspectRatio="xMidYMid meet">
      <rect width="1400" height="700" fill="#f1ead8"/>

      {/* dawn sky */}
      <defs>
        <linearGradient id="dawn-sky" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#e8d4b0"/>
          <stop offset="50%" stopColor="#f1c97f"/>
          <stop offset="100%" stopColor="#f4c65a"/>
        </linearGradient>
      </defs>
      <rect x="100" y="100" width="1200" height="380" fill="url(#dawn-sky)" stroke="#1a1814" strokeWidth="1"/>

      {/* sun */}
      <circle cx="1100" cy="220" r="36" fill="#fff7d0" opacity="0.95" stroke="#1a1814" strokeWidth="0.5"/>

      {/* skyline */}
      <g fill="#c9bfa8" stroke="#1a1814" strokeWidth="0.8">
        <rect x="100" y="260" width="80" height="220"/>
        <rect x="180" y="220" width="60" height="260"/>
        <rect x="240" y="280" width="70" height="200"/>
        <rect x="310" y="200" width="50" height="280"/>
        <rect x="360" y="240" width="70" height="240"/>
        <rect x="980" y="240" width="80" height="240"/>
        <rect x="1060" y="200" width="60" height="280"/>
        <rect x="1120" y="260" width="70" height="220"/>
        <rect x="1190" y="220" width="60" height="260"/>
        <rect x="1250" y="260" width="50" height="220"/>
      </g>
      {/* skyline windows */}
      {[[140,300,60,160],[200,250,40,220],[270,320,50,140],[330,240,30,220],[390,280,50,180],[1000,280,60,180],[1080,240,40,220],[1140,300,50,160],[1210,260,40,220],[1260,300,30,160]].map(([x,y,w,h],i) => (
        <g key={i}>
          {Array.from({length: Math.floor(h/20)}).map((_, row) =>
            Array.from({length: Math.floor(w/14)}).map((_, col) => {
              const lit = Math.random() > 0.55;
              return <rect key={`${row}-${col}`} x={x + col*14 + 2} y={y + row*20 + 3} width="8" height="12" fill={lit ? '#f4c65a' : '#1a1814'} opacity={lit ? 0.9 : 0.7}/>;
            })
          )}
        </g>
      ))}

      {/* stage — center, mid-ground */}
      <g transform="translate(700, 430)">
        <rect x="-140" y="0" width="280" height="50" fill="#1a1814"/>
        <rect x="-130" y="-8" width="260" height="10" fill="#3a2418"/>
        {/* banner */}
        <rect x="-160" y="-90" width="320" height="60" fill="#6b2e2e" stroke="#1a1814" strokeWidth="1"/>
        <path d="M -160 -30 L -180 -15 L -160 -15" fill="#6b2e2e" stroke="#1a1814" strokeWidth="1"/>
        <path d="M 160 -30 L 180 -15 L 160 -15" fill="#6b2e2e" stroke="#1a1814" strokeWidth="1"/>
        <text x="0" y="-68" textAnchor="middle" fill="#f4c65a" fontSize="18" fontFamily="serif" fontStyle="italic">A Home You Can Afford</text>
        <text x="0" y="-46" textAnchor="middle" fill="#fff" fontSize="11" fontFamily="serif" letterSpacing="0.2em">MARCUS · METROTOWN · SATURDAY</text>

        {/* podium figure — Marcus */}
        <g transform="translate(0, -18)">
          <rect x="-12" y="0" width="24" height="18" fill="#1e2540" stroke="#1a1814" strokeWidth="0.5"/>
          <circle cx="0" cy="-8" r="7" fill="#e0cdae" stroke="#1a1814" strokeWidth="0.5"/>
          <path d="M -7 -12 Q 0 -18 7 -12" fill="#2a2620" stroke="#1a1814" strokeWidth="0.4"/>
        </g>
      </g>

      {/* crowd — figures, not dots */}
      <g>
        {Array.from({length: 180}).map((_, i) => {
          const row = Math.floor(i / 30);
          const col = i % 30;
          const x = 180 + col * 36 + (row % 2 ? 14 : 0) + (Math.random() - 0.5) * 4;
          const y = 510 + row * 32 + (Math.random() - 0.5) * 3;
          const isClose = row >= 4;
          const colr = isClose ? '#1a1814' : '#1a1814';
          return (
            <g key={i} transform={`translate(${x}, ${y})`}>
              <circle cx="0" cy="0" r="3" fill={colr} stroke="#1a1814" strokeWidth="0.3"/>
              <rect x="-3" y="3" width="6" height="8" fill={colr}/>
            </g>
          );
        })}
      </g>

      {/* Nakamura — tiny highlighted figure in crowd */}
      <g transform="translate(610, 606)">
        <circle r="16" fill="none" stroke="#6b2e2e" strokeWidth="1.2" strokeDasharray="2 2"/>
        <circle cx="0" cy="0" r="3.5" fill="#6b2e2e"/>
        <rect x="-3.5" y="3" width="7" height="9" fill="#6b2e2e"/>
        <line x1="0" y1="-16" x2="0" y2="-40" stroke="#1a1814" strokeWidth="0.5"/>
        <rect x="-80" y="-64" width="160" height="24" fill="#fff" stroke="#1a1814" strokeWidth="0.8"/>
        <text x="0" y="-49" textAnchor="middle" fill="#6b2e2e" fontSize="11" fontFamily="serif" fontStyle="italic">J. Nakamura is here</text>
      </g>

      {/* RSVP dial, top-left */}
      <g transform="translate(140, 130)">
        <rect x="0" y="0" width="160" height="76" fill="#f8f2e0" stroke="#1a1814" strokeWidth="1"/>
        <text x="10" y="18" fill="#1a1814" fontSize="9" fontFamily="serif" fontStyle="italic" letterSpacing="0.1em">RSVPs, live</text>
        <text x="10" y="52" fill="#6b2e2e" fontSize="30" fontFamily="serif" fontStyle="italic">2,247</text>
        <text x="10" y="68" fill="#1a1814" fontSize="9" fontFamily="serif">+12 signups / min</text>
        <text x="150" y="68" textAnchor="end" fill="#1a1814" fontSize="9" fontFamily="serif" fontStyle="italic">target 2,000 ✓</text>
      </g>

      {/* Forecast panel, top-right */}
      <g transform="translate(1160, 130)">
        <rect x="-20" y="0" width="140" height="76" fill="#f8f2e0" stroke="#1a1814" strokeWidth="1"/>
        <text x="-10" y="18" fill="#1a1814" fontSize="9" fontFamily="serif" fontStyle="italic" letterSpacing="0.1em">Saturday 11:00</text>
        <text x="-10" y="50" fill="#1a1814" fontSize="24" fontFamily="serif" fontStyle="italic">18°C</text>
        <circle cx="90" cy="42" r="10" fill="#f4c65a" stroke="#1a1814" strokeWidth="0.5"/>
        <text x="-10" y="68" fill="#1a1814" fontSize="9" fontFamily="serif">clear · light breeze</text>
      </g>

      {/* ground label */}
      <text x="700" y="670" textAnchor="middle" fill="#1a1814" fontSize="11" fontFamily="serif" fontStyle="italic" letterSpacing="0.25em">
        METROTOWN SQUARE · A DAY AFTER THE VOTE
      </text>
    </svg>
  );
}

// ─── Flipbook shell
const Flipbook = () => {
  const [idx, setIdx] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const [zoomOrigin, setZoomOrigin] = useState({ x: 50, y: 50 });
  const [cursor, setCursor] = useState({ x: 50, y: 50 });
  const [typedValue, setTypedValue] = useState('');
  const stageRef = useRef(null);

  const page = FB_PAGES[idx];

  const advance = (originX = 50, originY = 50) => {
    if (transitioning) return;
    setZoomOrigin({ x: originX, y: originY });
    setTransitioning(true);
    setTimeout(() => {
      setIdx(i => (i + 1) % FB_PAGES.length);
      setTimeout(() => setTransitioning(false), 60);
    }, 420);
  };

  const back = () => {
    if (transitioning || idx === 0) return;
    setZoomOrigin({ x: 50, y: 50 });
    setTransitioning(true);
    setTimeout(() => {
      setIdx(i => Math.max(0, i - 1));
      setTimeout(() => setTransitioning(false), 60);
    }, 300);
  };

  const clear = () => {
    if (transitioning) return;
    setTransitioning(true);
    setTimeout(() => {
      setIdx(0);
      setTimeout(() => setTransitioning(false), 60);
    }, 300);
  };

  const handleStageClick = (e) => {
    const rect = stageRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    advance(x, y);
  };

  const handleMove = (e) => {
    const rect = stageRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setCursor({ x, y });
  };

  const stageStyle = transitioning ? {
    transform: `scale(1.18) translate(${(50 - zoomOrigin.x) * 0.3}%, ${(50 - zoomOrigin.y) * 0.3}%)`,
    opacity: 0,
    transition: 'transform 420ms cubic-bezier(.3,.05,.3,1), opacity 320ms ease-out 120ms',
  } : {
    transform: 'scale(1) translate(0,0)',
    opacity: 1,
    transition: 'transform 260ms ease-out, opacity 240ms ease-out 80ms',
  };

  return (
    <figure className="flipbook2">
      {/* Address bar */}
      <div className="fb2__bar">
        <div className="fb2__btns">
          <button className="fb2__dot fb2__dot--back" onClick={back} disabled={idx === 0} aria-label="Back"/>
          <button className="fb2__dot" aria-label="—" disabled/>
        </div>
        <div className="fb2__addr">
          <input
            className="fb2__addr-input"
            value={typedValue}
            placeholder={page.title}
            onChange={(e) => setTypedValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && typedValue.trim()) { setTypedValue(''); advance(); } }}
          />
          <span className="fb2__addr-ghost">/ {page.session}</span>
        </div>
        <button className="fb2__clear" onClick={clear}>Clear</button>
        <button className="fb2__share" aria-label="Share">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4">
            <path d="M8 10 V2 M5 5 L8 2 L11 5 M3 9 V13 H13 V9"/>
          </svg>
        </button>
      </div>

      {/* Stage frame */}
      <div
        ref={stageRef}
        className="fb2__frame"
        onClick={handleStageClick}
        onMouseMove={handleMove}>
        <div className="fb2__stage" style={stageStyle}>
          {/* Corner crest */}
          <div className="fb2__crest fb2__crest--tl"><Crest kind={page.flag}/></div>
          {/* Title plaque */}
          <div className="fb2__plaque">
            <span className="fb2__plaque-txt">{page.title}</span>
          </div>
          {/* The scene */}
          <div className="fb2__scene">{page.render()}</div>
          {/* Bottom fact strip */}
          <div className="fb2__foot">
            <span className="fb2__foot-txt">{page.foot}</span>
          </div>
        </div>

        {/* click cursor hint */}
        <div className="fb2__cursor" style={{ left: cursor.x + '%', top: cursor.y + '%' }}>
          <div className="fb2__cursor-dot"/>
          <div className="fb2__cursor-label">Click to continue →</div>
        </div>

        {/* page counter */}
        <div className="fb2__count">{idx + 1} / {FB_PAGES.length}</div>
      </div>
    </figure>
  );
};

export { Flipbook };