/* CrescaSections.jsx — v3 production */

/* ── Shared helpers ── */
function SectionLabel({ text }) {
  return (
    <div className="section-label">
      <span>{text}</span>
    </div>
  );
}

function SectionHead({ label, title, sub }) {
  return (
    <div className="section-head reveal">
      <SectionLabel text={label}/>
      <h2 dangerouslySetInnerHTML={{__html:title}}/>
      {sub && <p>{sub}</p>}
    </div>
  );
}

/* ── Engines ─────────────────────────────────────────────── */
function CrescaEngines() {
  const cards = [
    {
      h:'Instant Asset Swaps',
      p:'Best-price routing via live oracle feeds. Any Algorand Standard Asset, sub-second finality.',
      tag:'DART Swap',
      icon:(
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="m7 7 10 0"/><path d="m13 3 4 4-4 4"/>
          <path d="m17 17-10 0"/><path d="m11 21-4-4 4-4"/>
        </svg>
      ),
    },
    {
      h:'Basket & Bundle Trading',
      p:'Trade curated multi-asset baskets or build your own. Long and short in one atomic transaction.',
      tag:'Bucket Protocol',
      icon:(
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="8" height="8"/>
          <rect x="13" y="3" width="8" height="8"/>
          <rect x="3" y="13" width="8" height="8"/>
          <rect x="13" y="13" width="8" height="8"/>
        </svg>
      ),
    },
    {
      h:'Scheduled Payments',
      p:'Automate recurring or one-time on-chain payments. Escrowed in-contract and cancellable anytime.',
      tag:'Calendar Payments',
      icon:(
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="18" height="16" rx="2"/>
          <path d="M16 3v4"/><path d="M8 3v4"/><path d="M3 11h18"/>
        </svg>
      ),
    },
  ];

  return (
    <section id="engines" aria-label="Protocol Engines"
      style={{padding:'88px 1.6rem',maxWidth:1200,margin:'0 auto'}}>
      <SectionHead
        label="Protocol Engines"
        title="Three DeFi engines.<br/>One wallet."
        sub="Not a wrapper. Not a bridge. Each engine is a deployed smart contract on Algorand Testnet."/>
      <div className="engines-grid reveal d1"
        style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginTop:48}}>
        {cards.map((c,i) => (
          <article key={c.tag} className="glass-card" role="listitem"
            style={{padding:'28px 26px',cursor:'default'}}>
            {/* Icon */}
            <div style={{width:46,height:46,borderRadius:12,marginBottom:20,
              border:'1px solid rgba(56,189,248,0.25)',
              background:'linear-gradient(135deg,rgba(27,44,193,0.55),rgba(56,189,248,0.1))',
              display:'grid',placeItems:'center',color:'#38BDF8',
              boxShadow:'0 0 24px rgba(56,189,248,0.1)'}}>
              {c.icon}
            </div>
            {/* Tag */}
            <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'0.56rem',
              textTransform:'uppercase',letterSpacing:'0.16em',
              color:'rgba(56,189,248,0.45)',marginBottom:10}}>{c.tag}</div>
            {/* Title */}
            <h3 style={{fontSize:'1.02rem',fontWeight:600,marginBottom:10,
              letterSpacing:'-0.01em',color:'#DBEEFF',lineHeight:1.35}}>{c.h}</h3>
            {/* Body */}
            <p style={{color:'#7A9AB5',fontSize:'0.88rem',lineHeight:1.72}}>{c.p}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

/* ── Why Cresca ──────────────────────────────────────────── */
function CrescaWhy() {
  const highlights = [
    {
      icon:(<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5M2 17l10 5 10-5M2 12l10 5 10-5"/></svg>),
      title:'All on-chain',
      desc:'Every action — swaps, baskets, scheduled payments — executes directly on Algorand. No off-chain middleware.',
    },
    {
      icon:(<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>),
      title:'Non-custodial',
      desc:'You hold your keys. Cresca never touches your assets — every transaction is signed by you alone.',
    },
    {
      icon:(<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>),
      title:'Sub-4s finality',
      desc:'Algorand settles blocks in under 4 seconds. No waiting, no confirmations, no anxiety.',
    },
    {
      icon:(<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m7 7 10 0"/><path d="m13 3 4 4-4 4"/><path d="m17 17-10 0"/><path d="m11 21-4-4 4-4"/></svg>),
      title:'Oracle pricing',
      desc:'DART uses Pyth live oracle feeds — not AMM spot. Best price, every time, with route confidence.',
    },
  ];

  const compare = [
    {others:'Hold and send only',        cresca:'Hold, trade, and automate'},
    {others:'Manual token swaps',        cresca:'Oracle-routed best price'},
    {others:'No payment scheduling',     cresca:'On-chain payment automation'},
    {others:'Single-asset focus',        cresca:'Multi-asset baskets, one tx'},
    {others:'External DApp required',    cresca:'All engines inside the wallet'},
  ];

  return (
    <section id="truth" aria-label="Why Cresca"
      style={{padding:'88px 1.6rem',maxWidth:1200,margin:'0 auto'}}>
      <SectionHead
        label="Why Cresca"
        title="Not just a wallet."
        sub="Other wallets stop at balances. Cresca gives you a full DeFi cockpit — trading engines and payment automation built right in."/>

      {/* ── Highlight cards ── */}
      <div className="engines-grid reveal d1"
        style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginTop:48}}>
        {highlights.map((h,i) => (
          <div key={h.title} className={`glass-card reveal d${i+1}`}
            style={{padding:'24px 22px',cursor:'default'}}>
            <div style={{width:42,height:42,borderRadius:11,marginBottom:16,
              border:'1px solid rgba(56,189,248,0.22)',
              background:'linear-gradient(135deg,rgba(27,44,193,0.5),rgba(56,189,248,0.08))',
              display:'grid',placeItems:'center',color:'#38BDF8'}}>
              {h.icon}
            </div>
            <h3 style={{fontSize:'0.96rem',fontWeight:600,color:'#DBEEFF',
              marginBottom:8,letterSpacing:'-0.01em'}}>{h.title}</h3>
            <p style={{color:'#7A9AB5',fontSize:'0.85rem',lineHeight:1.7}}>{h.desc}</p>
          </div>
        ))}
      </div>

      {/* ── Comparison table ── */}
      <div className="why-grid reveal d2"
        style={{display:'grid',gridTemplateColumns:'1fr 1.5fr',gap:12,marginTop:12}}>
        {/* Left info card */}
        <div className="glass-card" style={{padding:'0',overflow:'hidden',cursor:'default'}}>
          <div style={{padding:'24px 26px 20px'}}>
            <h3 style={{fontFamily:"'Oswald',sans-serif",fontWeight:400,textTransform:'uppercase',
              letterSpacing:'0.04em',fontSize:'1.5rem',lineHeight:1.1,color:'#DBEEFF',marginBottom:12}}>
              Built for<br/>DeFi power users
            </h3>
            <p style={{color:'#7A9AB5',lineHeight:1.76,fontSize:'0.9rem'}}>
              Cresca treats your wallet as a DeFi cockpit, not just a balance sheet.
              Every feature is on-chain.
            </p>
          </div>
          <div style={{borderTop:'1px solid rgba(56,189,248,0.08)'}}>
            {[
              {l:'Contracts deployed', v:'3'},
              {l:'Tx finality',        v:'< 4s'},
              {l:'Custody model',      v:'Non-custodial'},
              {l:'Chain',              v:'Algorand'},
            ].map((s,i,a) => (
              <div key={s.l} style={{
                display:'flex',justifyContent:'space-between',alignItems:'center',
                padding:'14px 26px',
                borderBottom:i<a.length-1?'1px solid rgba(56,189,248,0.06)':'none',
                transition:'background 0.18s',
              }}
              onMouseEnter={e=>e.currentTarget.style.background='rgba(56,189,248,0.04)'}
              onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                <span style={{fontSize:'0.86rem',color:'#5A7A90'}}>{s.l}</span>
                <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'0.82rem',
                  color:'#38BDF8',fontWeight:700,letterSpacing:'0.04em'}}>{s.v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right comparison */}
        <div className="glass-card" style={{overflow:'hidden',cursor:'default',padding:0}}>
          {/* Header */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',padding:'14px 24px',
            borderBottom:'1px solid rgba(56,189,248,0.08)',
            background:'rgba(27,44,193,0.1)'}}>
            <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'0.58rem',
              textTransform:'uppercase',letterSpacing:'0.14em',color:'rgba(255,255,255,0.2)'}}>
              Others
            </span>
            <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'0.58rem',
              textTransform:'uppercase',letterSpacing:'0.14em',color:'rgba(56,189,248,0.6)'}}>
              Cresca
            </span>
          </div>
          {/* Rows */}
          {compare.map((r,i) => (
            <div key={i} style={{
              display:'grid',gridTemplateColumns:'1fr 1fr',padding:'16px 24px',
              borderBottom:i<compare.length-1?'1px solid rgba(56,189,248,0.05)':'none',
              transition:'background 0.18s',gap:16,
            }}
            onMouseEnter={e=>e.currentTarget.style.background='rgba(56,189,248,0.04)'}
            onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              <span style={{fontSize:'0.88rem',color:'rgba(255,255,255,0.2)',lineHeight:1.55}}>
                {r.others}
              </span>
              <span style={{fontSize:'0.88rem',color:'#A8C8E8',lineHeight:1.55,
                display:'flex',alignItems:'flex-start',gap:9}}>
                <span style={{width:5,height:5,borderRadius:'50%',background:'#38BDF8',
                  marginTop:7,flexShrink:0,display:'inline-block',
                  boxShadow:'0 0 6px rgba(56,189,248,0.5)'}}/>
                {r.cresca}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── How It Works ────────────────────────────────────────── */
function CrescaSteps() {
  const steps = [
    {
      n:'01',
      h:'Create or import wallet',
      p:'Connect your Algorand wallet or generate a new one in 30 seconds.',
      icon:(
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      ),
    },
    {
      n:'02',
      h:'Pick your engine',
      p:'Choose DART Swap, Basket Trading, or Calendar Payments — all from one dashboard.',
      icon:(
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/>
        </svg>
      ),
    },
    {
      n:'03',
      h:'Sign and settle',
      p:'Sign once. Algorand finalizes your transaction in under 4 seconds, on-chain.',
      icon:(
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      ),
    },
  ];

  return (
    <section id="how" aria-label="How It Works"
      style={{padding:'88px 1.6rem',maxWidth:1200,margin:'0 auto'}}>
      <SectionHead label="How It Works" title="Three steps to go live."/>
      <div className="steps-grid reveal d1"
        style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginTop:48}}>
        {steps.map((s,i) => (
          <div key={s.n} className="glass-card" style={{padding:'32px 28px',cursor:'default',
            position:'relative',overflow:'hidden'}}>
            {/* Big ghost number */}
            <div style={{position:'absolute',top:16,right:20,
              fontFamily:"'Oswald',sans-serif",fontSize:'5rem',fontWeight:600,
              color:'rgba(56,189,248,0.04)',lineHeight:1,pointerEvents:'none',
              userSelect:'none'}}>{s.n}</div>
            {/* Icon */}
            <div style={{width:48,height:48,borderRadius:13,marginBottom:22,
              border:'1px solid rgba(56,189,248,0.25)',
              background:'linear-gradient(135deg,rgba(27,44,193,0.55),rgba(56,189,248,0.1))',
              display:'grid',placeItems:'center',color:'#38BDF8',
              boxShadow:'0 0 24px rgba(56,189,248,0.1)'}}>
              {s.icon}
            </div>
            <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'0.6rem',
              letterSpacing:'0.16em',color:'rgba(56,189,248,0.4)',textTransform:'uppercase',
              marginBottom:8}}>Step {s.n}</div>
            <h3 style={{fontSize:'1.02rem',fontWeight:600,marginBottom:10,
              letterSpacing:'-0.01em',color:'#DBEEFF',lineHeight:1.35}}>{s.h}</h3>
            <p style={{color:'#7A9AB5',fontSize:'0.88rem',lineHeight:1.72}}>{s.p}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

Object.assign(window, { CrescaEngines, CrescaWhy, CrescaSteps, SectionHead, SectionLabel });
