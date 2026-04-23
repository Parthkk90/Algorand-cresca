/* CrescaFeatures.jsx — v3 production */

/* ── DART Swap ───────────────────────────────────────────── */
function CrescaDart() {
  return (
    <section id="dart" aria-label="DART Swap"
      style={{padding:'88px 1.6rem',maxWidth:1200,margin:'0 auto'}}>
      <SectionHead
        label="DART Swap"
        title="Oracle-routed.<br/>Best price, every time."/>
      <div className="glass-card reveal d1" style={{marginTop:48,overflow:'hidden',borderRadius:20}}>
        {/* Status bar */}
        <div style={{padding:'11px 22px',borderBottom:'1px solid rgba(56,189,248,0.09)',
          display:'flex',alignItems:'center',justifyContent:'space-between',
          background:'rgba(27,44,193,0.12)'}}>
          <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'0.58rem',
            textTransform:'uppercase',letterSpacing:'0.12em',color:'rgba(56,189,248,0.4)'}}>
            DART Swap Engine
          </span>
          <span style={{display:'flex',alignItems:'center',gap:6,
            fontFamily:"'JetBrains Mono',monospace",fontSize:'0.58rem',color:'#38BDF8'}}>
            <span style={{width:5,height:5,borderRadius:'50%',background:'#38BDF8',
              boxShadow:'0 0 6px rgba(56,189,248,0.7)',display:'inline-block',
              animation:'livePulse 2s ease-in-out infinite'}}/>
            Testnet
          </span>
        </div>

        <div className="dart-body"
          style={{display:'grid',gridTemplateColumns:'1fr 1.2fr'}}>
          {/* Info */}
          <div style={{padding:'34px 32px',borderRight:'1px solid rgba(56,189,248,0.07)'}}>
            <h3 style={{fontFamily:"'Oswald',sans-serif",fontWeight:400,textTransform:'uppercase',
              fontSize:'1.65rem',letterSpacing:'0.03em',lineHeight:1.05,
              marginBottom:22,color:'#DBEEFF'}}>
              The fastest route<br/>to your swap
            </h3>
            <div style={{display:'grid',gap:15,marginBottom:28}}>
              {[
                'Live oracle price feeds for confident route decisions.',
                'Best-path routing across all supported liquidity pools.',
                'Atomic execution — swap signs and settles in one block.',
              ].map((b,i) => (
                <div key={i} className="feat-bullet">{b}</div>
              ))}
            </div>
            {/* Oracle box */}
            <div style={{padding:'14px 18px',background:'rgba(0,0,0,0.45)',
              borderRadius:12,border:'1px solid rgba(56,189,248,0.12)'}}>
              <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'0.55rem',
                textTransform:'uppercase',letterSpacing:'0.12em',
                color:'rgba(56,189,248,0.4)',marginBottom:6}}>Oracle source</div>
              <div style={{fontSize:'0.92rem',color:'#A8C8E8',fontWeight:600}}>
                Pyth Network · Real-time price feeds
              </div>
            </div>
          </div>

          {/* Viz */}
          <div style={{padding:'30px 28px'}}>
            {/* Route diagram */}
            <div style={{display:'grid',
              gridTemplateColumns:'auto 1fr auto 1fr auto',
              gap:10,alignItems:'center',marginBottom:24}}>
              {[
                {label:'You send',    val:'100 ALGO'},
                null,
                {label:'DART Router', val:'Best Path', accent:true},
                null,
                {label:'You receive', val:'18.34 USDC'},
              ].map((n,i) => {
                if (n === null && i === 1) return (
                  <div key={i} className="flow-line"/>
                );
                if (n === null && i === 3) return (
                  <div key={i} className="flow-line rev"/>
                );
                return (
                  <div key={i} style={{
                    border:`1px solid ${n.accent?'rgba(56,189,248,0.42)':'rgba(56,189,248,0.1)'}`,
                    borderRadius:12, padding:'12px 14px',
                    background:n.accent?'rgba(27,44,193,0.45)':'rgba(0,0,0,0.4)',
                    textAlign:'center',
                    boxShadow:n.accent?'0 0 36px rgba(56,189,248,0.18)':'none',
                    minWidth:92,
                  }}>
                    <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'0.52rem',
                      textTransform:'uppercase',letterSpacing:'0.1em',
                      color:'rgba(56,189,248,0.4)',marginBottom:5}}>
                      {n.label}
                    </div>
                    <div style={{fontWeight:700,fontSize:'0.94rem',
                      color:n.accent?'#38BDF8':'#A8C8E8'}}>
                      {n.val}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Metrics */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',
              gap:8,marginBottom:18}}>
              {[
                {l:'Slippage',         v:'0.3%',  c:'#A8C8E8'},
                {l:'Route confidence', v:'High',   c:'#38BDF8'},
                {l:'Finality',         v:'< 4s',   c:'#38BDF8'},
              ].map(m => (
                <div key={m.l} style={{border:'1px solid rgba(56,189,248,0.09)',
                  borderRadius:10, padding:'11px 13px',
                  background:'rgba(0,0,0,0.4)'}}>
                  <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'0.52rem',
                    textTransform:'uppercase',letterSpacing:'0.08em',
                    color:'rgba(56,189,248,0.38)',marginBottom:5}}>{m.l}</div>
                  <div style={{fontWeight:700,fontSize:'0.9rem',color:m.c}}>{m.v}</div>
                </div>
              ))}
            </div>

            {/* Mini chart */}
            <div style={{height:80,borderRadius:11,overflow:'hidden',
              background:'rgba(0,0,0,0.42)',border:'1px solid rgba(56,189,248,0.09)'}}>
              <SparkLine color="#38BDF8" h={80}/>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Basket ──────────────────────────────────────────────── */
const BASKETS = {
  DeFi:     [{n:'ALGO', p:35,c:'#38BDF8'},{n:'USDC',p:25,c:'#5C6BC0'},{n:'GARD',p:20,c:'#93C5FD'},{n:'TINY',p:20,c:'#3949AB'}],
  AI:       [{n:'PLANET',p:40,c:'#38BDF8'},{n:'VEST',p:30,c:'#5C6BC0'},{n:'YLDY',p:20,c:'#93C5FD'},{n:'ALGO',p:10,c:'#1E88E5'}],
  Stable:   [{n:'USDC', p:50,c:'#38BDF8'},{n:'GARD',p:30,c:'#5C6BC0'},{n:'ALGO',p:20,c:'#93C5FD'}],
  Leveraged:[{n:'ALGO', p:60,c:'#38BDF8'},{n:'TINY',p:25,c:'#5C6BC0'},{n:'VEST',p:15,c:'#93C5FD'}],
};

function CrescaBasket() {
  const [tab, setTab] = React.useState('DeFi');
  return (
    <section id="basket" aria-label="Basket Trading"
      style={{padding:'88px 1.6rem',maxWidth:1200,margin:'0 auto'}}>
      <SectionHead
        label="Basket Trading"
        title="12 assets.<br/>One transaction."/>
      <div className="glass-card reveal d1" style={{marginTop:48,overflow:'hidden',borderRadius:20}}>
        <div style={{padding:'11px 22px',borderBottom:'1px solid rgba(56,189,248,0.09)',
          display:'flex',alignItems:'center',justifyContent:'space-between',
          background:'rgba(27,44,193,0.12)'}}>
          <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'0.58rem',
            textTransform:'uppercase',letterSpacing:'0.12em',color:'rgba(56,189,248,0.4)'}}>
            Bucket Protocol Engine
          </span>
          <span style={{display:'flex',alignItems:'center',gap:6,
            fontFamily:"'JetBrains Mono',monospace",fontSize:'0.58rem',color:'#38BDF8'}}>
            <span style={{width:5,height:5,borderRadius:'50%',background:'#38BDF8',
              boxShadow:'0 0 6px rgba(56,189,248,0.7)',display:'inline-block',
              animation:'livePulse 2s ease-in-out infinite'}}/>
            Testnet
          </span>
        </div>
        <div className="dart-body" style={{display:'grid',gridTemplateColumns:'1fr 1fr'}}>
          <div style={{padding:'34px 32px',borderRight:'1px solid rgba(56,189,248,0.07)'}}>
            <h3 style={{fontFamily:"'Oswald',sans-serif",fontWeight:400,textTransform:'uppercase',
              fontSize:'1.65rem',letterSpacing:'0.03em',lineHeight:1.05,
              marginBottom:22,color:'#DBEEFF'}}>
              Curated baskets &<br/>custom bundles
            </h3>
            <div style={{display:'grid',gap:15}}>
              {[
                'Curated baskets: DeFi, AI, Stable, Leveraged.',
                'Custom weight allocation for your own bundle.',
                'Open leveraged long or short in one transaction.',
              ].map((b,i) => <div key={i} className="feat-bullet">{b}</div>)}
            </div>
          </div>
          <div style={{padding:'28px 26px'}}>
            {/* Tabs */}
            <div style={{display:'flex',gap:6,marginBottom:20,flexWrap:'wrap'}}>
              {Object.keys(BASKETS).map(t => (
                <button key={t} onClick={()=>setTab(t)} style={{
                  padding:'0.32rem 0.82rem',borderRadius:7,fontSize:'0.78rem',fontWeight:600,
                  border:`1px solid ${tab===t?'rgba(56,189,248,0.4)':'rgba(56,189,248,0.1)'}`,
                  background:tab===t?'rgba(27,44,193,0.45)':'transparent',
                  color:tab===t?'#38BDF8':'#5A7A90',
                  cursor:'pointer',fontFamily:"'Inter',sans-serif",transition:'all 0.18s',
                }}>
                  {t}
                </button>
              ))}
            </div>
            {/* Bars */}
            <div style={{display:'grid',gap:12}}>
              {BASKETS[tab].map(a => (
                <div key={a.n} style={{display:'grid',
                  gridTemplateColumns:'56px 1fr 42px',gap:10,alignItems:'center'}}>
                  <span style={{fontSize:'0.86rem',fontWeight:700,color:'#A8C8E8'}}>{a.n}</span>
                  <div style={{height:7,borderRadius:999,
                    background:'rgba(56,189,248,0.08)',overflow:'hidden'}}>
                    <div style={{height:'100%',width:`${a.p}%`,background:a.c,
                      borderRadius:999,transition:'width 0.65s ease'}}/>
                  </div>
                  <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'0.64rem',
                    color:'rgba(56,189,248,0.45)',textAlign:'right'}}>{a.p}%</span>
                </div>
              ))}
            </div>
            <div style={{marginTop:20,padding:'12px 15px',background:'rgba(0,0,0,0.42)',
              borderRadius:10,border:'1px solid rgba(56,189,248,0.09)',
              fontSize:'0.83rem',color:'#7A9AB5',lineHeight:1.65}}>
              Atomically swaps into all basket assets via DART oracle routing.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Calendar Payments ───────────────────────────────────── */
function CrescaCalendar() {
  const [cd, setCd] = React.useState(6*60+37);
  const [exec, setExec] = React.useState(4);
  const total = 12;
  React.useEffect(() => {
    const id = setInterval(() => setCd(c => {
      if (c <= 0) { setExec(e => Math.min(total, e+1)); return 7*60+4; }
      return c - 1;
    }), 1000);
    return () => clearInterval(id);
  }, []);
  const mm = String(Math.floor(cd/60)).padStart(2,'0');
  const ss = String(cd%60).padStart(2,'0');
  const payments = Array.from({length:12},(_,i)=>({
    idx: i+1,
    status: i<exec ? 'done' : i===exec ? 'pending' : 'future',
    fill:   i<exec ? 100   : i===exec ? 48     : 0,
  }));
  const STATUS = {
    done:    {bg:'rgba(56,189,248,0.1)',  color:'#38BDF8', border:'rgba(56,189,248,0.25)'},
    pending: {bg:'rgba(100,149,237,0.1)',color:'#93C5FD', border:'rgba(100,149,237,0.25)'},
    future:  {bg:'rgba(255,255,255,0.03)',color:'rgba(255,255,255,0.18)',border:'rgba(56,189,248,0.06)'},
  };

  return (
    <section id="calendar" aria-label="Calendar Payments"
      style={{padding:'88px 1.6rem',maxWidth:1200,margin:'0 auto'}}>
      <SectionHead
        label="Calendar Payments"
        title="Set it once.<br/>Pay on-chain forever."/>
      <div className="glass-card reveal d1" style={{marginTop:48,overflow:'hidden',borderRadius:20}}>
        <div style={{padding:'11px 22px',borderBottom:'1px solid rgba(56,189,248,0.09)',
          display:'flex',alignItems:'center',justifyContent:'space-between',
          background:'rgba(27,44,193,0.12)'}}>
          <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'0.58rem',
            textTransform:'uppercase',letterSpacing:'0.12em',color:'rgba(56,189,248,0.4)'}}>
            Calendar Payments Engine
          </span>
          <span style={{display:'flex',alignItems:'center',gap:6,
            fontFamily:"'JetBrains Mono',monospace",fontSize:'0.58rem',color:'#38BDF8'}}>
            <span style={{width:5,height:5,borderRadius:'50%',background:'#38BDF8',
              boxShadow:'0 0 6px rgba(56,189,248,0.7)',display:'inline-block',
              animation:'livePulse 2s ease-in-out infinite'}}/>
            Testnet
          </span>
        </div>
        <div className="dart-body" style={{display:'grid',gridTemplateColumns:'1fr 1.2fr'}}>
          <div style={{padding:'34px 32px',borderRight:'1px solid rgba(56,189,248,0.07)'}}>
            <h3 style={{fontFamily:"'Oswald',sans-serif",fontWeight:400,textTransform:'uppercase',
              fontSize:'1.65rem',letterSpacing:'0.03em',lineHeight:1.05,
              marginBottom:22,color:'#DBEEFF'}}>
              Automated escrow<br/>payments
            </h3>
            <div style={{display:'grid',gap:15}}>
              {[
                'Once, weekly, monthly, or fully custom cadence.',
                'Funds escrowed in-contract until execution time.',
                'Cancel anytime — no middleman, no permission needed.',
              ].map((b,i) => <div key={i} className="feat-bullet">{b}</div>)}
            </div>
          </div>
          <div style={{padding:'26px 26px'}}>
            <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'0.55rem',
              textTransform:'uppercase',letterSpacing:'0.12em',
              color:'rgba(56,189,248,0.4)',marginBottom:13}}>
              Payment schedule · 12 payments · 7-day cadence
            </div>
            {/* Payment list */}
            <div style={{display:'grid',gap:7,marginBottom:18}}>
              {payments.map(p => {
                const st = STATUS[p.status];
                return (
                  <div key={p.idx} style={{display:'flex',alignItems:'center',gap:10}}>
                    <span style={{fontFamily:"'JetBrains Mono',monospace",
                      fontSize:'0.56rem',color:'rgba(56,189,248,0.35)',width:24,flexShrink:0}}>
                      #{p.idx}
                    </span>
                    <div style={{flex:1,height:6,borderRadius:999,
                      background:'rgba(56,189,248,0.07)',overflow:'hidden'}}>
                      <div style={{height:'100%',width:`${p.fill}%`,
                        background:p.status==='done'?'#38BDF8':p.status==='pending'?'#93C5FD':'transparent',
                        borderRadius:999,transition:'width 0.5s ease'}}/>
                    </div>
                    <div style={{
                      background:st.bg,color:st.color,
                      border:`1px solid ${st.border}`,
                      fontFamily:"'JetBrains Mono',monospace",fontSize:'0.54rem',
                      textTransform:'uppercase',letterSpacing:'0.08em',
                      padding:'2px 8px',borderRadius:5,minWidth:56,textAlign:'center',
                      flexShrink:0,
                    }}>
                      {p.status==='done'?'Done':p.status==='pending'?'Next':'Queued'}
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Stat row */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
              {[
                {l:'Next exec',v:`00:${mm}:${ss}`,acc:true},
                {l:'Cadence',  v:'7 days'},
                {l:'Progress', v:`${exec} / ${total}`},
              ].map(m => (
                <div key={m.l} style={{
                  border:`1px solid ${m.acc?'rgba(56,189,248,0.24)':'rgba(56,189,248,0.08)'}`,
                  borderRadius:10,padding:'11px 13px',background:'rgba(0,0,0,0.4)',
                }}>
                  <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'0.52rem',
                    textTransform:'uppercase',letterSpacing:'0.08em',
                    color:'rgba(56,189,248,0.38)',marginBottom:5}}>{m.l}</div>
                  <div style={{fontWeight:700,fontSize:'0.9rem',
                    color:m.acc?'#38BDF8':'#A8C8E8',
                    fontFamily:m.acc?"'JetBrains Mono',monospace":'inherit'}}>
                    {m.v}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Trust & Contracts ───────────────────────────────────── */
function CrescaTrust() {
  const contracts = [
    {
      h:'DART Swap',
      desc:'Oracle-routed asset swaps with best-path execution and sub-second finality.',
      icon:(<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m7 7 10 0"/><path d="m13 3 4 4-4 4"/><path d="m17 17-10 0"/><path d="m11 21-4-4 4-4"/></svg>),
    },
    {
      h:'Bucket Protocol',
      desc:'Multi-asset basket trading with custom weights and atomic leveraged positions.',
      icon:(<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="8" height="8"/><rect x="13" y="3" width="8" height="8"/><rect x="3" y="13" width="8" height="8"/><rect x="13" y="13" width="8" height="8"/></svg>),
    },
    {
      h:'Calendar Payments',
      desc:'Automated on-chain escrow payments on any custom schedule — fully trustless.',
      icon:(<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4"/><path d="M8 3v4"/><path d="M3 11h18"/></svg>),
    },
  ];

  const trustStats = [
    {l:'Contracts',  big:'3',     sub:'deployed on Testnet'},
    {l:'Tx finality',big:'< 4s',  sub:'on-chain settlement'},
    {l:'Custody',    big:'100%',  sub:'non-custodial'},
  ];

  return (
    <section id="trust" aria-label="Trust and Contracts"
      style={{padding:'88px 1.6rem',maxWidth:1200,margin:'0 auto'}}>
      <SectionHead
        label="Trust & Contracts"
        title="Deployed on<br/>Algorand Testnet."
        sub="Every contract is publicly verifiable. No upgradeable proxies. No admin keys. Non-custodial by design."/>

      {/* Contract cards */}
      <div className="engines-grid reveal d1"
        style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginTop:48}}>
        {contracts.map(c => (
          <article key={c.h} className="glass-card" style={{padding:'28px 26px',cursor:'default'}}>
            <div style={{width:46,height:46,borderRadius:12,marginBottom:18,
              border:'1px solid rgba(56,189,248,0.25)',
              background:'linear-gradient(135deg,rgba(27,44,193,0.55),rgba(56,189,248,0.1))',
              display:'grid',placeItems:'center',color:'#38BDF8',
              boxShadow:'0 0 24px rgba(56,189,248,0.1)'}}>
              {c.icon}
            </div>
            <h3 style={{fontSize:'1rem',fontWeight:600,marginBottom:8,
              color:'#DBEEFF',letterSpacing:'-0.01em'}}>{c.h}</h3>
            <p style={{fontSize:'0.86rem',color:'#7A9AB5',lineHeight:1.68,marginBottom:18}}>
              {c.desc}
            </p>
            <div style={{display:'flex',alignItems:'center',gap:6,
              fontFamily:"'JetBrains Mono',monospace",fontSize:'0.56rem',
              color:'rgba(56,189,248,0.5)',textTransform:'uppercase',letterSpacing:'0.1em'}}>
              <span style={{width:5,height:5,borderRadius:'50%',background:'#38BDF8',
                boxShadow:'0 0 6px rgba(56,189,248,0.6)',display:'inline-block'}}/>
              Algorand Testnet
            </div>
          </article>
        ))}
      </div>

      {/* Trust banner */}
      <div className="reveal d2" style={{marginTop:12,padding:'14px 22px',
        border:'1px solid rgba(56,189,248,0.16)',borderRadius:12,
        background:'rgba(27,44,193,0.1)',textAlign:'center',
        fontFamily:"'JetBrains Mono',monospace",fontSize:'0.62rem',letterSpacing:'0.16em',
        textTransform:'uppercase',color:'rgba(56,189,248,0.5)'}}>
        Open source · Non-custodial · Algorand Testnet · Zero admin keys
      </div>

      {/* Stat strip */}
      <div className="engines-grid reveal d3"
        style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginTop:12}}>
        {trustStats.map(s => (
          <div key={s.l} style={{border:'1px solid rgba(56,189,248,0.1)',borderRadius:14,
            padding:'22px 24px',background:'rgba(27,44,193,0.08)',cursor:'default'}}>
            <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'0.55rem',
              textTransform:'uppercase',letterSpacing:'0.12em',
              color:'rgba(56,189,248,0.4)',marginBottom:8}}>{s.l}</div>
            <div style={{fontSize:'2.2rem',fontWeight:800,color:'#38BDF8',
              letterSpacing:'-0.03em',lineHeight:1}}>{s.big}</div>
            <div style={{fontSize:'0.8rem',color:'#7A9AB5',marginTop:5}}>{s.sub}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── Waitlist ─────────────────────────────────────────────── */
function CrescaWaitlist() {
  const [form, setForm] = React.useState({name:'',email:'',role:'Trader'});
  const [msg,  setMsg]  = React.useState('');
  const [ok,   setOk]   = React.useState(false);
  const [done, setDone] = React.useState(false);

  const submit = e => {
    e.preventDefault();
    if (!form.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      setMsg('Please enter a valid email address.'); setOk(false); return;
    }
    setMsg('You\'re on the list. We\'ll be in touch soon.');
    setOk(true); setDone(true);
    setForm({name:'',email:'',role:'Trader'});
  };

  return (
    <section id="waitlist" aria-label="Join Waitlist"
      style={{padding:'88px 1.6rem 112px',maxWidth:1200,margin:'0 auto'}}>
      {/* Heading */}
      <div className="reveal" style={{textAlign:'center',marginBottom:44}}>
        <SectionLabel text="Early Access"/>
        <h2 style={{fontFamily:"'Oswald',sans-serif",fontWeight:500,textTransform:'uppercase',
          letterSpacing:'0.02em',lineHeight:0.92,
          fontSize:'clamp(2.2rem,4vw,3.1rem)',color:'#E2EEFF',marginBottom:14}}>
          Built for traders<br/>who want more.
        </h2>
        <p style={{color:'#7A9AB5',lineHeight:1.76,fontSize:'0.96rem',maxWidth:'48ch',margin:'0 auto'}}>
          Early access for DART swaps, basket trading, and payment automation.
        </p>
      </div>

      {/* Form card */}
      <form className="reveal d1" onSubmit={submit} noValidate style={{
        maxWidth:580, margin:'0 auto',
        border:'1px solid rgba(56,189,248,0.2)',
        borderRadius:22,
        background:'linear-gradient(160deg,rgba(27,44,193,0.18),rgba(5,10,26,0.8))',
        padding:'40px 38px',
        boxShadow:'0 32px 90px rgba(27,44,193,0.2), 0 0 0 1px rgba(56,189,248,0.05)',
        backdropFilter:'blur(28px)',
      }}>
        <h3 style={{fontFamily:"'Oswald',sans-serif",fontWeight:400,textTransform:'uppercase',
          fontSize:'1.9rem',letterSpacing:'0.04em',textAlign:'center',
          marginBottom:8,color:'#DBEEFF'}}>
          Join the waitlist
        </h3>
        <p style={{textAlign:'center',color:'#7A9AB5',fontSize:'0.9rem',
          lineHeight:1.65,marginBottom:28}}>
          Be first when Cresca launches. No spam, just access.
        </p>

        <div className="form-grid"
          style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
          <div style={{display:'grid',gap:6}}>
            <label style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'0.58rem',
              textTransform:'uppercase',letterSpacing:'0.12em',color:'rgba(56,189,248,0.5)'}}>
              Name
            </label>
            <input className="cresca-input" type="text" placeholder="Your name"
              value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/>
          </div>
          <div style={{display:'grid',gap:6}}>
            <label style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'0.58rem',
              textTransform:'uppercase',letterSpacing:'0.12em',color:'rgba(56,189,248,0.5)'}}>
              Email *
            </label>
            <input className="cresca-input" type="email" placeholder="you@domain.com"
              value={form.email}
              onChange={e=>setForm({...form,email:e.target.value})} required/>
          </div>
        </div>

        <div style={{display:'grid',gap:6,marginBottom:20}}>
          <label style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'0.58rem',
            textTransform:'uppercase',letterSpacing:'0.12em',color:'rgba(56,189,248,0.5)'}}>
            Role
          </label>
          <select className="cresca-input" style={{cursor:'pointer'}}
            value={form.role} onChange={e=>setForm({...form,role:e.target.value})}>
            {['Trader','Portfolio manager','Treasury operator','Builder','Other']
              .map(r => <option key={r} style={{background:'#05101a'}}>{r}</option>)}
          </select>
        </div>

        <button type="submit" disabled={done} className="btn-primary"
          style={{width:'100%',justifyContent:'center',padding:'0.9rem',
            fontSize:'0.94rem',fontWeight:600,
            ...(done ? {background:'rgba(56,189,248,0.25)',boxShadow:'none',cursor:'default'} : {})}}>
          {done ? '✓ You\'re on the list' : 'Join waitlist →'}
        </button>

        {msg && (
          <p style={{textAlign:'center',marginTop:12,fontSize:'0.86rem',
            color:ok?'#38BDF8':'#F87171'}}>
            {msg}
          </p>
        )}
        <p style={{textAlign:'center',marginTop:12,color:'#5A7A90',fontSize:'0.84rem'}}>
          Questions?{' '}
          <a href="mailto:hello@cresca.finance"
            style={{color:'#38BDF8',textDecoration:'none',transition:'color 0.18s'}}
            onMouseEnter={e=>e.target.style.color='#93C5FD'}
            onMouseLeave={e=>e.target.style.color='#38BDF8'}>
            hello@cresca.finance
          </a>
        </p>
      </form>
    </section>
  );
}

/* ── Footer ──────────────────────────────────────────────── */
function CrescaFooter() {
  const year = new Date().getFullYear();
  return (
    <footer role="contentinfo" style={{
      borderTop:'1px solid rgba(56,189,248,0.07)',
      padding:'28px 1.6rem 40px',
      maxWidth:1200, margin:'0 auto',
    }}>
      <div style={{display:'flex',alignItems:'center',
        justifyContent:'space-between',flexWrap:'wrap',gap:14}}>
        {/* Brand */}
        <div style={{display:'flex',alignItems:'center',gap:10,
          fontFamily:"'Oswald',sans-serif",textTransform:'uppercase',
          letterSpacing:'0.1em',fontSize:'0.92rem',color:'rgba(56,189,248,0.4)'}}>
          <div style={{width:28,height:28,borderRadius:7,
            background:'linear-gradient(135deg,rgba(27,44,193,0.85),rgba(56,189,248,0.5))',
            display:'grid',placeItems:'center',flexShrink:0}}>
            <svg width="15" height="15" viewBox="0 0 22 22" fill="none">
              <path d="M3 8h13M11 4l5 4-5 4" stroke="white"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M19 14H6M11 18l-5-4 5-4" stroke="rgba(147,197,253,0.8)"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          Cresca Protocol
        </div>
        {/* Center labels */}
        <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'0.56rem',
          textTransform:'uppercase',letterSpacing:'0.12em',color:'rgba(56,189,248,0.14)'}}>
          DART SWAP · BUCKET POSITIONS · CALENDAR PAYMENTS · ALGORAND TESTNET
        </span>
        {/* Copyright */}
        <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'0.56rem',
          color:'rgba(56,189,248,0.2)',letterSpacing:'0.04em'}}>
          © {year} Cresca
        </span>
      </div>
    </footer>
  );
}

Object.assign(window, { CrescaDart, CrescaBasket, CrescaCalendar, CrescaTrust, CrescaWaitlist, CrescaFooter });
