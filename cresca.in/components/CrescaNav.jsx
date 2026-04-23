/* CrescaNav.jsx — v3 production */

const TICKER_DATA = [
  {sym:'ALGO/USD', price:'0.1842', change:'+2.14%', up:true},
  {sym:'USDC/ALGO', price:'5.430',  change:'-0.08%', up:false},
  {sym:'GARD/ALGO', price:'0.0041', change:'+0.52%', up:true},
  {sym:'TINY/ALGO', price:'0.0028', change:'+5.3%',  up:true},
  {sym:'YLDY/ALGO', price:'0.00014',change:'-1.2%',  up:false},
  {sym:'VEST/ALGO', price:'0.0072', change:'+0.9%',  up:true},
  {sym:'PLANET/ALGO',price:'0.0019',change:'+3.1%',  up:true},
];

function Ticker() {
  const items = [...TICKER_DATA, ...TICKER_DATA];
  return (
    <div className="ticker-bar">
      <div className="ticker-live">
        <span style={{width:5,height:5,borderRadius:'50%',background:'#38BDF8',
          boxShadow:'0 0 6px rgba(56,189,248,0.9)',display:'inline-block',
          marginRight:7,animation:'livePulse 2s ease-in-out infinite'}}/>
        Live
      </div>
      <div style={{overflow:'hidden',flex:1}}>
        <div className="ticker-scroll">
          {items.map((t,i) => (
            <div key={i} className="ticker-item">
              <span style={{color:'#4A607A',fontSize:'0.58rem'}}>{t.sym}</span>
              <span style={{color:'#A8C0D0'}}>{t.price}</span>
              <span style={{color:t.up?'#38BDF8':'#F87171',fontWeight:500}}>{t.change}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BlockCounter() {
  const [block, setBlock] = React.useState(49812044);
  React.useEffect(() => {
    const id = setInterval(() => setBlock(b => b + Math.floor(Math.random()*2+1)), 3200);
    return () => clearInterval(id);
  }, []);
  return (
    <div style={{display:'flex',alignItems:'center',gap:6,
      fontFamily:"'JetBrains Mono',monospace",fontSize:'0.6rem',
      color:'#5A7A90',letterSpacing:'0.04em'}}>
      <span style={{width:5,height:5,borderRadius:'50%',background:'#38BDF8',
        boxShadow:'0 0 6px rgba(56,189,248,0.8)',display:'inline-block',
        animation:'livePulse 2s ease-in-out infinite'}}/>
      Block #{block.toLocaleString()}
    </div>
  );
}

function CrescaNav() {
  const [scrolled, setScrolled] = React.useState(false);
  React.useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);

  const navLinks = [
    ['#engines','Engines'],
    ['#dart','DART'],
    ['#basket','Basket'],
    ['#calendar','Calendar'],
    ['#trust','Contracts'],
  ];

  return (
    <div style={{position:'sticky',top:0,zIndex:40}}>
      <Ticker/>
      <nav className={`cresca-nav${scrolled?' scrolled':''}`}
        style={{background: scrolled ? undefined : 'rgba(5,10,26,0.75)'}}>
        <div style={{maxWidth:1200,margin:'0 auto',padding:'0 1.6rem',
          width:'100%',display:'flex',alignItems:'center',justifyContent:'space-between',gap:16}}>

          {/* ── Brand ── */}
          <a href="#top" aria-label="Cresca home"
            style={{display:'flex',alignItems:'center',gap:11,textDecoration:'none',color:'inherit',flexShrink:0}}>
            {/* Finance-grade logomark — sharp two-arrow C exchange mark */}
            <div style={{
              width:36,height:36,borderRadius:8,flexShrink:0,
              background:'linear-gradient(145deg,#0D1B8E 0%,#1434C8 45%,#0A6EBD 100%)',
              display:'grid',placeItems:'center',position:'relative',overflow:'hidden',
              boxShadow:'0 0 0 1px rgba(255,255,255,0.14), 0 0 0 1px rgba(56,189,248,0.3), 0 4px 24px rgba(20,52,200,0.6), 0 1px 0 rgba(255,255,255,0.18) inset',
            }}>
              {/* Inner highlight */}
              <div style={{position:'absolute',top:0,left:0,right:0,height:'50%',
                background:'linear-gradient(180deg,rgba(255,255,255,0.12),transparent)',
                borderRadius:'8px 8px 0 0',pointerEvents:'none'}}/>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                {/* Top arrow: left to right → */}
                <path d="M2 6.5H13.5" stroke="white" strokeWidth="2.2"
                  strokeLinecap="round"/>
                <path d="M10 3L14 6.5L10 10" stroke="white" strokeWidth="2.2"
                  strokeLinecap="round" strokeLinejoin="round"/>
                {/* Bottom arrow: right to left ← */}
                <path d="M18 13.5H6.5" stroke="rgba(147,197,253,0.95)" strokeWidth="2.2"
                  strokeLinecap="round"/>
                <path d="M10 10L6 13.5L10 17" stroke="rgba(147,197,253,0.95)" strokeWidth="2.2"
                  strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div style={{display:'flex',flexDirection:'column',lineHeight:1}}>
              <span style={{
                fontFamily:"'Oswald',sans-serif",textTransform:'uppercase',
                letterSpacing:'0.15em',fontSize:'1.08rem',fontWeight:600,
                color:'#FFFFFF',lineHeight:1.1,
              }}>
                Cresca
              </span>
              <span style={{
                fontFamily:"'JetBrains Mono',monospace",fontSize:'0.48rem',
                letterSpacing:'0.18em',textTransform:'uppercase',
                color:'rgba(56,189,248,0.55)',marginTop:2,
              }}>
                Protocol
              </span>
            </div>
          </a>

          {/* ── Links ── */}
          <div className="nav-links" style={{display:'flex',alignItems:'center',gap:1}}>
            {navLinks.map(([href, label]) => (
              <a key={href} href={href} style={{
                padding:'0.4rem 0.82rem',borderRadius:7,
                fontSize:'0.82rem',color:'#5A7A90',textDecoration:'none',
                transition:'color 0.18s, background 0.18s',letterSpacing:'0.01em',
                fontWeight:500,
              }}
              onMouseEnter={e=>{e.target.style.color='#E2EEFF';e.target.style.background='rgba(56,189,248,0.07)'}}
              onMouseLeave={e=>{e.target.style.color='#5A7A90';e.target.style.background='transparent'}}>
                {label}
              </a>
            ))}
          </div>

          {/* ── Right cluster ── */}
          <div style={{display:'flex',alignItems:'center',gap:14,flexShrink:0}}>
            <BlockCounter/>
            <a href="#waitlist" className="btn-primary" style={{padding:'0.5rem 1.15rem',fontSize:'0.8rem'}}>
              Join Waitlist
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
              </svg>
            </a>
          </div>
        </div>
      </nav>
    </div>
  );
}

Object.assign(window, { CrescaNav, TICKER_DATA });
