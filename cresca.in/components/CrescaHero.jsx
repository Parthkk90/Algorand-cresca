/* CrescaHero.jsx — v3 production */

function SparkLine({ color = '#38BDF8', h = 120 }) {
  const pts = [62,55,70,48,58,42,50,38,44,32,40,26,34,30,28,24,32,18,26,22,20,28,16,20,24,14,18,22,12,18,24,10,16,20,10,14,18,8,14,18,10,12,16,8,12,16,10,8];
  const W = 500, H = h;
  const sx = W / (pts.length - 1);
  const sy = v => (v / 80) * (H - 16) + 8;
  const d = pts.map((y,i) => `${i===0?'M':'L'}${i*sx},${sy(y)}`).join(' ');
  const area = d + ` L${(pts.length-1)*sx},${H} L0,${H} Z`;
  const id = `sp${Math.random().toString(36).slice(2,7)}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
      style={{width:'100%',height:'100%',display:'block'}}>
      <defs>
        <linearGradient id={`${id}a`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.2"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor={color} stopOpacity="0">
            <animate attributeName="offset" values="-0.4;1.2" dur="2.8s" repeatCount="indefinite"/>
          </stop>
          <stop offset="50%"  stopColor={color} stopOpacity="1">
            <animate attributeName="offset" values="0.1;1.7"  dur="2.8s" repeatCount="indefinite"/>
          </stop>
          <stop offset="100%" stopColor={color} stopOpacity="0">
            <animate attributeName="offset" values="0.6;2.2"  dur="2.8s" repeatCount="indefinite"/>
          </stop>
        </linearGradient>
      </defs>
      {[0.25,0.5,0.75].map(f => (
        <line key={f} x1="0" y1={H*f} x2={W} y2={H*f}
          stroke="rgba(255,255,255,0.04)" strokeWidth="1"/>
      ))}
      <path d={area} fill={`url(#${id}a)`}/>
      <path d={d} fill="none" stroke={color} strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" opacity="0.4"/>
      <path d={d} fill="none" stroke={`url(#${id}b)`} strokeWidth="2.4"
        strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx={(pts.length-1)*sx} cy={sy(pts[pts.length-1])} r="3.5" fill={color}>
        <animate attributeName="r"       values="3.5;5.5;3.5" dur="2.2s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="1;0.4;1"      dur="2.2s" repeatCount="indefinite"/>
      </circle>
    </svg>
  );
}

function HeroPanel() {
  const [price, setPrice] = React.useState(0.1842);
  React.useEffect(() => {
    const id = setInterval(() =>
      setPrice(p => +(p + (Math.random()-0.5)*0.0009).toFixed(4)), 2200);
    return () => clearInterval(id);
  }, []);
  const chg = ((price - 0.1804) / 0.1804 * 100).toFixed(2);

  const engines = [
    {label:'DART Engine',   val:'Active', accent:false},
    {label:'Bucket Engine', val:'Active', accent:false},
    {label:'Calendar Engine',val:'Active',accent:false},
    {label:'Network',       val:'Testnet',accent:true},
  ];

  return (
    <div style={{
      border:'1px solid rgba(56,189,248,0.16)',
      borderRadius:22,
      background:'linear-gradient(160deg,rgba(27,44,193,0.16) 0%,rgba(5,10,26,0.7) 100%)',
      backdropFilter:'blur(28px)',
      boxShadow:'0 40px 100px rgba(0,0,0,0.7), 0 0 0 1px rgba(56,189,248,0.06), inset 0 1px 0 rgba(56,189,248,0.1)',
      overflow:'hidden',
    }}>
      {/* Header bar */}
      <div style={{
        padding:'12px 18px', display:'flex', alignItems:'center',
        justifyContent:'space-between',
        borderBottom:'1px solid rgba(56,189,248,0.09)',
        background:'rgba(27,44,193,0.1)',
      }}>
        <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'0.58rem',
          textTransform:'uppercase',letterSpacing:'0.14em',color:'rgba(56,189,248,0.45)'}}>
          Runtime Stats
        </span>
        <span style={{display:'flex',alignItems:'center',gap:6,
          fontFamily:"'JetBrains Mono',monospace",fontSize:'0.58rem',
          color:'#38BDF8',letterSpacing:'0.08em'}}>
          <span style={{width:5,height:5,borderRadius:'50%',background:'#38BDF8',
            boxShadow:'0 0 8px rgba(56,189,248,0.9)',display:'inline-block',
            animation:'livePulse 2s ease-in-out infinite'}}/>
          Testnet · Live
        </span>
      </div>

      {/* Chart */}
      <div style={{padding:'14px 16px 8px'}}>
        <div style={{height:114,background:'rgba(0,0,0,0.42)',borderRadius:12,
          overflow:'hidden',border:'1px solid rgba(56,189,248,0.09)',position:'relative'}}>
          <div style={{position:'absolute',top:9,left:12,zIndex:2,
            fontFamily:"'JetBrains Mono',monospace",fontSize:'0.56rem',
            color:'rgba(56,189,248,0.4)',textTransform:'uppercase',letterSpacing:'0.1em'}}>
            ALGO / USD
          </div>
          <div style={{position:'absolute',top:9,right:12,zIndex:2,
            display:'flex',alignItems:'center',gap:7}}>
            <span style={{fontFamily:"'JetBrains Mono',monospace",
              fontSize:'0.72rem',color:'#E2EEFF',fontWeight:700}}>${price}</span>
            <span style={{fontFamily:"'JetBrains Mono',monospace",
              fontSize:'0.6rem',color:chg>=0?'#38BDF8':'#F87171',fontWeight:600}}>
              {chg>=0?'+':''}{chg}%
            </span>
          </div>
          <SparkLine color="#38BDF8" h={114}/>
        </div>
      </div>

      {/* Engine stat grid */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,padding:'6px 16px'}}>
        {engines.map(s => (
          <div key={s.label} style={{
            border:`1px solid ${s.accent?'rgba(56,189,248,0.25)':'rgba(56,189,248,0.07)'}`,
            borderRadius:10, padding:'10px 13px',
            background:s.accent?'rgba(56,189,248,0.06)':'rgba(0,0,0,0.32)',
          }}>
            <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'0.52rem',
              textTransform:'uppercase',letterSpacing:'0.1em',
              color:'rgba(56,189,248,0.4)',marginBottom:4}}>{s.label}</div>
            <div style={{fontSize:'0.9rem',fontWeight:700,
              color:s.accent?'#38BDF8':'#E2EEFF',letterSpacing:s.accent?'0.04em':'-0.01em'}}>
              {s.val}
            </div>
          </div>
        ))}
      </div>

      {/* Note */}
      <div style={{margin:'6px 16px 16px',padding:'10px 14px',
        border:'1px solid rgba(56,189,248,0.15)',borderRadius:11,
        background:'rgba(56,189,248,0.04)',
        fontSize:'0.82rem',color:'#7A9AB5',lineHeight:1.65,
        display:'flex',alignItems:'flex-start',gap:9}}>
        <span style={{width:5,height:5,borderRadius:'50%',background:'#38BDF8',
          marginTop:6,flexShrink:0,display:'inline-block'}}/>
        All three contracts deployed on Algorand Testnet — audited and non-custodial.
      </div>
    </div>
  );
}

function CrescaHero() {
  return (
    <section id="top" aria-label="Hero"
      style={{maxWidth:1200,margin:'0 auto',padding:'88px 1.6rem 72px'}}>
      <div className="hero-grid"
        style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:56,alignItems:'center'}}>

        {/* ── Left copy ── */}
        <div className="reveal">
          {/* Badge */}
          <div className="sky-badge" style={{marginBottom:24}}>
            <span style={{width:6,height:6,borderRadius:'50%',background:'#38BDF8',
              animation:'livePulse 2s ease-in-out infinite',display:'inline-block'}}/>
            Algorand Testnet · Non-custodial
          </div>

          {/* Headline */}
          <h1 style={{
            fontFamily:"'Oswald',sans-serif",fontWeight:500,
            textTransform:'uppercase',letterSpacing:'0.01em',
            lineHeight:0.88,fontSize:'clamp(3rem,6vw,5.4rem)',
            marginBottom:22,
          }}>
            The only<br/>
            <span className="grad-text">smart wallet</span><br/>
            on Algorand
          </h1>

          {/* Subline */}
          <p style={{fontSize:'1.02rem',color:'#7A9AB5',lineHeight:1.76,
            maxWidth:'42ch',marginBottom:32,letterSpacing:'0.01em'}}>
            Swap assets at oracle prices, trade multi-asset baskets, and automate on-chain
            payments — all inside one wallet.
          </p>

          {/* CTAs */}
          <div style={{display:'flex',gap:12,flexWrap:'wrap',marginBottom:36}}>
            <a href="#waitlist" className="btn-primary">
              Launch App
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
              </svg>
            </a>
            <a href="#trust" className="btn-ghost">View Contracts</a>
          </div>

          {/* Contract chips */}
          <div style={{display:'flex',flexWrap:'wrap',gap:7}}>
            {['CrescaDartSwap','CrescaBucketProtocol','CrescaCalendarPayments'].map(c => (
              <span key={c} style={{
                fontFamily:"'JetBrains Mono',monospace",fontSize:'0.56rem',
                letterSpacing:'0.04em',border:'1px solid rgba(56,189,248,0.14)',
                borderRadius:6,padding:'0.26rem 0.56rem',
                color:'rgba(56,189,248,0.45)',background:'rgba(27,44,193,0.15)',
              }}>{c}</span>
            ))}
          </div>
        </div>

        {/* ── Right panel ── */}
        <div className="reveal d1">
          <HeroPanel/>
        </div>
      </div>

      {/* ── Stat strip ── */}
      <div className="stat-strip reveal d2" style={{marginTop:56}}>
        {[
          {val:'3',      lbl:'DeFi Engines'},
          {val:'< 4s',   lbl:'Tx Finality'},
          {val:'100%',   lbl:'Non-Custodial'},
          {val:'0',      lbl:'Admin Keys'},
          {val:'Testnet',lbl:'Network'},
        ].map(s => (
          <div key={s.lbl} className="stat-strip-item">
            <div className="val">{s.val}</div>
            <div className="lbl">{s.lbl}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

Object.assign(window, { CrescaHero, SparkLine });
