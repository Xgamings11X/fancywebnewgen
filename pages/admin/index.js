import { useState, useEffect, useCallback, useRef } from 'react';
import Head from 'next/head';
import toast from 'react-hot-toast';
import ImageUpload from '../../components/ImageUpload';
import Icon from '../../components/Icon';

const TABS = [
  { id:'dashboard', label:'Dashboard',    icon:'chart-line'    },
  { id:'products',  label:'Produk',        icon:'box-open'      },
  { id:'categories',label:'Kategori',      icon:'folder-open'   },
  { id:'redeem',    label:'Redeem Code',   icon:'ticket'        },
  { id:'orders',    label:'Log Transaksi', icon:'receipt'       },
  { id:'reports',   label:'Report',        icon:'flag'          },
  { id:'settings',  label:'Pengaturan',    icon:'gear'          },
];

const idr = v => `Rp ${Number(v||0).toLocaleString('id-ID')}`;
const fmt = d => d ? new Date(d).toLocaleString('id-ID',{dateStyle:'short',timeStyle:'short'}) : '-';
const cx  = (...parts) => parts.filter(Boolean).join(' ');

const ORDER_STATUS_BADGE = {
  pending:   'admin-badge-yellow',
  success:   'admin-badge-green',
  paid:      'admin-badge-green',
  failed:    'admin-badge-red',
  expired:   'admin-badge-gray',
  cancelled: 'admin-badge-gray',
};

const TICKET_STATUS_BADGE = {
  open:      'admin-badge-yellow',
  in_review: 'admin-badge-blue',
  resolved:  'admin-badge-green',
  rejected:  'admin-badge-red',
};

const TICKET_STATUS_LABEL = { open:'Menunggu', in_review:'Review', resolved:'Selesai', rejected:'Ditolak' };

const TICKET_TYPES = {
  banding:'⚖️ Aju Banding', bug:'🐛 Report Bug',
  report_player:'🚨 Report Pemain', lainnya:'📝 Lainnya',
};

const CATEGORY_COLOR_MAP = {
  orange:'var(--primary)', red:'#e74c3c', purple:'#9b59b6',
  blue:'#3498db', green:'#2ecc71', yellow:'#f1c40f',
};

function useAF() {
  return useCallback(async (url, opts={}) => {
    const t = typeof window !== 'undefined' ? localStorage.getItem('admin_token') : '';
    const res = await fetch(url, {
      ...opts,
      headers: { 'Content-Type':'application/json', ...(t?{Authorization:`Bearer ${t}`}:{}), ...(opts.headers||{}) },
      credentials: 'include',
    });
    if (res.status === 401) { localStorage.removeItem('admin_token'); window.location.reload(); }
    return res.json().catch(()=>({}));
  }, []);
}

export default function AdminPanel() {
  const [tab,          setTab]          = useState('dashboard');
  const [sidebar,      setSidebar]      = useState(true);
  const [loggedIn,     setLoggedIn]     = useState(false);
  const [lForm,        setLForm]        = useState({username:'',password:''});
  const [lLoading,     setLLoading]     = useState(false);
  const [lError,       setLError]       = useState('');
  const [showPwd,      setShowPwd]      = useState(false);
  const [loading,      setLoading]      = useState(false);

  const [products,     setProducts]     = useState([]);
  const [categories,   setCategories]   = useState([]);
  const [prodSortDirty,   setProdSortDirty]   = useState(false);
  const [catSortDirty,    setCatSortDirty]    = useState(false);
  const [prodSortSaving,  setProdSortSaving]  = useState(false);
  const [catSortSaving,   setCatSortSaving]   = useState(false);
  const [orders,       setOrders]       = useState([]);
  const [tickets,      setTickets]      = useState([]);
  const [codes,        setCodes]        = useState([]);
  const [stats,        setStats]        = useState({total:0,success:0,pending:0,failed:0,revenue:0});
  const [orderFilter,  setOrderFilter]  = useState('all');
  const [reportFilter, setReportFilter] = useState('all');

  const [showProductModal,  setShowProductModal]  = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showRedeemModal,   setShowRedeemModal]   = useState(false);
  const [editProduct,       setEditProduct]       = useState(null);
  const [editCategory,      setEditCategory]      = useState(null);
  const [settings,          setSettings]          = useState({});
  const [settingsSaving,    setSettingsSaving]    = useState(false);
  const af = useAF();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (['dashboard','products'].includes(tab))   { const r=await af('/api/admin/products');  if(r.success){ setProducts(r.products||[]); setProdSortDirty(false); } }
      if (['dashboard','categories'].includes(tab)) { const r=await af('/api/admin/categories');if(r.success){ setCategories(r.categories||[]); setCatSortDirty(false); } }
      if (['dashboard','orders'].includes(tab))     { const r=await af(`/api/admin/orders?status=${orderFilter}`); if(r.success){setOrders(r.orders||[]);if(r.stats)setStats(r.stats);} }
      if (tab==='reports')                          { const r=await af(`/api/admin/support?status=${reportFilter}`); if(r.success) setTickets(r.tickets||[]); }
      if (tab==='redeem')                           { const r=await af('/api/admin/redeem'); if(r.success) setCodes(r.codes||[]); }
      if (tab==='settings')                         { const r=await af('/api/admin/settings'); if(r.success) setSettings(r.settings||{}); }
    } catch {}
    setLoading(false);
  }, [af, orderFilter, reportFilter, tab]);

  useEffect(() => { if (localStorage.getItem('admin_token')) setLoggedIn(true); }, []);
  useEffect(() => { if (loggedIn) load(); }, [loggedIn, load]);

  // Realtime polling untuk tab reports dan orders (setiap 10 detik)
  useEffect(() => {
    if (!loggedIn) return;
    const REALTIME_TABS = ['reports', 'orders', 'dashboard'];
    if (!REALTIME_TABS.includes(tab)) return;
    const iv = setInterval(async () => {
      try {
        if (tab === 'reports') { const r=await af(`/api/admin/support?status=${reportFilter}`); if(r.success) setTickets(r.tickets||[]); }
        if (tab === 'orders' || tab === 'dashboard') { const r=await af(`/api/admin/orders?status=${orderFilter}`); if(r.success){setOrders(r.orders||[]);if(r.stats)setStats(r.stats);} }
      } catch {}
    }, 10000);
    return () => clearInterval(iv);
  }, [af, loggedIn, tab, orderFilter, reportFilter]);

  const login = async e => {
    e.preventDefault(); setLLoading(true); setLError('');
    try {
      const r = await fetch('/api/auth/admin-login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(lForm),credentials:'include'});
      const d = await r.json();
      if (d.success) { localStorage.setItem('admin_token',d.token); setLoggedIn(true); toast.success('Login berhasil!'); }
      else setLError(d.message||'Login gagal');
    } catch { setLError('Tidak bisa terhubung ke server'); }
    setLLoading(false);
  };

  const logout = () => { localStorage.removeItem('admin_token'); document.cookie='admin_token=;Max-Age=0;path=/'; setLoggedIn(false); toast.success('Logged out'); };

  const del = async (url, msg) => { if (!confirm(msg||'Yakin hapus?')) return; const r=await af(url,{method:'DELETE'}); if(r.success){toast.success('Berhasil dihapus');load();}else toast.error(r.message||'Gagal'); };

  // ── LOGIN ───────────────────────────────────────────────────
  if (!loggedIn) return (
    <>
      <Head><title>Admin Login — Fancy Network</title>
      </Head>
      <div className="adm-login-wrap">
        <div className="adm-login-box">
          <div className="adm-login-header">
            <div className="adm-login-brandmark"><img src="/fancy-network-logo.webp" alt="Fancy Network" /></div>
            <span className="adm-login-eyebrow">CONTROL CENTER</span>
            <h1 className="adm-login-title">Fancy Network Admin</h1>
            <p className="adm-login-subtitle">Kelola store, transaksi, ticket, dan konfigurasi server dari satu tempat.</p>
          </div>

          {/* Info box */}
          <div className="adm-login-info-box">
            <p className="adm-login-info-title">SECURE ADMIN ACCESS</p>
            <p>Credential diatur di <code className="adm-login-info-code">.env.local</code></p>
            <p className="adm-login-info-creds">ADMIN_USERNAME=admin<br/>ADMIN_PASSWORD=***</p>
          </div>

          <form onSubmit={login} className="adm-login-form">
            {lError && (
              <div className="adm-login-error">
                <Icon name="circle-exclamation" size={16} color="#e74c3c"/>
                <span className="adm-login-error-text">{lError}</span>
              </div>
            )}
            <div>
              <label className="admin-label">Username</label>
              <input type="text" value={lForm.username} onChange={e=>setLForm(p=>({...p,username:e.target.value}))}
                className="admin-input" autoComplete="username" required/>
            </div>
            <div>
              <label className="admin-label">Password</label>
              <div className="adm-pwd-wrap">
                <input type={showPwd?'text':'password'} value={lForm.password} onChange={e=>setLForm(p=>({...p,password:e.target.value}))}
                  className="admin-input adm-pwd-input" autoComplete="current-password" required/>
                <button type="button" onClick={()=>setShowPwd(!showPwd)} className="adm-pwd-toggle">
                  <Icon name={showPwd?'eye-slash':'eye'} size={14}/>
                </button>
              </div>
            </div>
            <button type="submit" disabled={lLoading||!lForm.username||!lForm.password} className="btn-primary-fn adm-login-submit">
              {lLoading?<><Icon name="spinner" size={14} spin className="fn-icon-mr"/> Memproses...</>:<><Icon name="lock" size={14} className="fn-icon-mr"/> Masuk ke Admin</>}
            </button>
          </form>
        </div>
      </div>
    </>
  );

  // ── DASHBOARD ───────────────────────────────────────────────
  return (
    <>
      <Head><title>Admin Panel — Fancy Network</title>
      </Head>

      <div className="admin-wrap">
        {/* Sidebar */}
        <aside className={cx('admin-sidebar', sidebar?'open':'closed')}>
          <div className="adm-sidebar-head">
            {sidebar && <div className="adm-sidebar-brand-wrap"><img src="/fancy-network-logo.webp" alt="Fancy Network" /><div><span className="adm-sidebar-brand">Fancy Network</span><small>CONTROL CENTER</small></div></div>}
            <button onClick={()=>setSidebar(!sidebar)} className="adm-sidebar-toggle">
              <Icon name={sidebar?'angles-left':'angles-right'} size={14}/>
            </button>
          </div>
          <nav className="adm-sidebar-nav">
            {TABS.map(t=>(
              <button key={t.id} onClick={()=>setTab(t.id)} className={`admin-nav-btn${tab===t.id?' active':''}`}>
                <Icon name={t.icon} size={14} className="adm-nav-icon"/>
                {sidebar&&<span className="adm-nav-label">{t.label}</span>}
              </button>
            ))}
          </nav>
          <div className="adm-sidebar-foot">
            <button onClick={logout} className="admin-nav-btn adm-logout-btn">
              <Icon name="right-from-bracket" size={14} className="adm-nav-icon"/>
              {sidebar&&<span>Logout</span>}
            </button>
          </div>
        </aside>

        {/* Main */}
        <main className="admin-main">
          <div className="admin-topbar">
            <div className="adm-topbar-heading"><span>FANCY NETWORK / ADMIN</span><h1 className="adm-topbar-title">{TABS.find(t=>t.id===tab)?.label}</h1></div>
            <div className="adm-topbar-actions">
              {tab==='orders' && (
                <button className="btn-ghost-fn text-xs"
                  onClick={async()=>{
                    const r = await af('/api/admin/test-webhook',{method:'POST'});
                    const d = r?.details || {};
                    // Tampilkan status Admin & Player secara terpisah
                    const adminOk  = d.admin?.ok  || d.admin?.skipped;
                    const playerOk = d.player?.ok || d.player?.skipped;
                    if (adminOk && playerOk) {
                      toast.success(r.message || 'Kedua webhook terkirim!', {duration:4000});
                    } else {
                      // Pisahkan toast per channel agar mudah diagnosa
                      if (!adminOk)  toast.error(`❌ Admin: ${d.admin?.message  || 'Gagal'}`, {duration:6000});
                      else           toast.success(`✅ Admin: OK`, {duration:3000});
                      if (d.player?.skipped) toast('ℹ️ Player: env var kosong', {duration:3000});
                      else if (!playerOk) toast.error(`❌ Player: ${d.player?.message || 'Gagal'}`, {duration:6000});
                      else           toast.success(`✅ Player: OK`, {duration:3000});
                    }
                  }}>
                  <Icon name="discord" size={14} className="fn-icon-mr"/> Test Webhook
                </button>
              )}
              <button onClick={load} className="btn-ghost-fn text-xs">
                <Icon name="rotate" size={14} spin={loading} className="fn-icon-mr"/> Refresh
              </button>
            </div>
          </div>

          <div className="adm-content">

            {/* ═══ DASHBOARD ═══════════════════════════════ */}
            {tab==='dashboard' && (
              <div className="adm-stack-lg">
                {/* Stats */}
                <div className="adm-stats-grid">
                  {[
                    {label:'Total Order', value:stats.total,       icon:'receipt',         color:'#3498db'},
                    {label:'Sukses',      value:stats.success,     icon:'circle-check',    color:'#2ecc71'},
                    {label:'Pending',     value:stats.pending,     icon:'clock',           color:'#f1c40f'},
                    {label:'Gagal',       value:stats.failed,      icon:'circle-xmark',    color:'#e74c3c'},
                    {label:'Revenue',     value:idr(stats.revenue),icon:'chart-line',      color:'var(--primary)'},
                  ].map((s,i)=>(
                    <div key={i} className="admin-stat-card">
                      <div className="adm-stat-icon" style={{'--c': `${s.color}18`}}>
                        <Icon name={s.icon} size={14} color={s.color}/>
                      </div>
                      <div className="adm-stat-value">{s.value}</div>
                      <div className="adm-stat-label">{s.label}</div>
                    </div>
                  ))}
                </div>
                <div className="adm-dash-grid2">
                  {/* Produk */}
                  <div className="admin-card adm-dash-card">
                    <p className="adm-dash-card-title">Produk Aktif <span>{products.filter(p=>p.is_active).length}</span></p>
                    {products.slice(0,6).map(p=>(
                      <div key={p.id} className="adm-dash-row">
                        <span className="adm-dash-row-name">{p.name}</span>
                        <span className="adm-dash-row-price">{idr(p.price)}</span>
                      </div>
                    ))}
                    {products.length===0&&<p className="adm-dash-empty">Belum ada produk</p>}
                  </div>
                  {/* Orders */}
                  <div className="admin-card adm-dash-card">
                    <p className="adm-dash-card-title">Transaksi Terbaru <span>LIVE</span></p>
                    {orders.slice(0,6).map(o=>(
                      <div key={o.order_id} className="adm-dash-row with-gap">
                        <span className="adm-dash-row-name">{o.player_username}</span>
                        <div className="adm-dash-row-meta">
                          <span className="adm-dash-row-price">{idr(o.amount)}</span>
                          <span className={`admin-badge ${ORDER_STATUS_BADGE[o.payment_status]||'admin-badge-gray'} text-[10px]`}>{o.payment_status}</span>
                        </div>
                      </div>
                    ))}
                    {orders.length===0&&<p className="adm-dash-empty">Belum ada transaksi</p>}
                  </div>
                </div>
              </div>
            )}

            {/* ═══ PRODUCTS ════════════════════════════════ */}
            {tab==='products' && (
              <div className="adm-stack">
                <div className="adm-tab-header">
                  <p className="adm-tab-header-text">{products.length} produk terdaftar · <span className="adm-tab-header-hint">klik ↑↓ untuk mengatur posisi</span></p>
                  <div className="adm-tab-header-actions">
                    {prodSortDirty && (
                      <button
                        className="btn-primary-fn adm-save-order-btn"
                        disabled={prodSortSaving}
                        onClick={async()=>{
                          setProdSortSaving(true);
                          try {
                            const r = await af('/api/admin/products',{method:'PATCH',body:JSON.stringify({action:'reorder',ids:products.map(x=>x.id)})});
                            if(r.success){ setProdSortDirty(false); toast.success('Urutan produk disimpan!'); }
                            else toast.error('Gagal menyimpan urutan');
                          } catch { toast.error('Gagal menyimpan urutan'); }
                          finally { setProdSortSaving(false); }
                        }}>
                        <Icon name={prodSortSaving?'spinner':'floppy-disk'} size={13} spin={prodSortSaving} className="fn-icon-mr"/> {prodSortSaving?'Menyimpan...':'Simpan Urutan'}
                      </button>
                    )}
                    <button className="btn-primary-fn" onClick={()=>{setEditProduct({});setShowProductModal(true);}}>
                      <Icon name="plus" size={14} className="fn-icon-mr"/> Tambah Produk
                    </button>
                  </div>
                </div>
                <div className="admin-card adm-table-card">
                  <div className="adm-table-scroll">
                    <table className="admin-table min-w-[700px]">
                      <thead><tr>
                        {['Urutan','Nama','Harga','Reward Trigger','Status','Aksi'].map(h=><th key={h}>{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {products.map((p,idx)=>(
                          <tr key={p.id}>
                            <td className="w-[80px]">
                              <div className="adm-sort-col">
                                <button
                                  disabled={idx===0}
                                  onClick={()=>{
                                    if(idx===0) return;
                                    const reordered=[...products];
                                    [reordered[idx-1],reordered[idx]]=[reordered[idx],reordered[idx-1]];
                                    setProducts(reordered);
                                    setProdSortDirty(true);
                                  }}
                                  className="adm-sort-btn">
                                  ↑
                                </button>
                                <span className="adm-sort-index">{idx+1}</span>
                                <button
                                  disabled={idx===products.length-1}
                                  onClick={()=>{
                                    if(idx===products.length-1) return;
                                    const reordered=[...products];
                                    [reordered[idx],reordered[idx+1]]=[reordered[idx+1],reordered[idx]];
                                    setProducts(reordered);
                                    setProdSortDirty(true);
                                  }}
                                  className="adm-sort-btn">
                                  ↓
                                </button>
                              </div>
                            </td>
                            <td>
                              <p className="adm-cell-name">{p.name}</p>
                              <p className="adm-cell-sub">{p.category_name||'—'}</p>
                            </td>
                            <td className="adm-cell-price">
                              {idr(p.price)}
                              {p.original_price>p.price&&<span className="admin-badge admin-badge-red adm-badge-discount">-{Math.round((1-p.price/p.original_price)*100)}%</span>}
                            </td>
                            <td><code className="adm-code-chip">{p.reward_trigger||'—'}</code></td>
                            <td>
                              <label className="toggle-switch">
                                <input type="checkbox" checked={!!p.is_active} onChange={async()=>{
                                  await af('/api/admin/products',{method:'PATCH',body:JSON.stringify({id:p.id,action:'toggle'})});
                                  load();
                                }}/>
                                <span className="toggle-slider"/>
                              </label>
                            </td>
                            <td>
                              <div className="adm-row-actions">
                                <button onClick={()=>{setEditProduct(p);setShowProductModal(true);}} className="adm-icon-btn edit">
                                  <Icon name="pen" size={13}/>
                                </button>
                                <button onClick={()=>del(`/api/admin/products?id=${p.id}&permanent=1`,'Hapus produk ini permanen?')} className="adm-icon-btn delete">
                                  <Icon name="trash" size={13}/>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {products.length===0&&<div className="adm-table-empty">Belum ada produk — klik Tambah Produk</div>}
                  </div>
                </div>
              </div>
            )}

            {/* ═══ CATEGORIES ══════════════════════════════ */}
            {tab==='categories' && (
              <div className="adm-stack">
                <div className="adm-tab-header">
                  <p className="adm-tab-header-text">{categories.length} kategori · <span className="adm-tab-header-hint">klik ↑↓ untuk mengatur urutan</span></p>
                  <div className="adm-tab-header-actions">
                    {catSortDirty && (
                      <button
                        className="btn-primary-fn adm-save-order-btn"
                        disabled={catSortSaving}
                        onClick={async()=>{
                          setCatSortSaving(true);
                          try {
                            const r = await af('/api/admin/categories',{method:'PATCH',body:JSON.stringify({action:'reorder',ids:categories.map(x=>x.id)})});
                            if(r.success){ setCatSortDirty(false); toast.success('Urutan kategori disimpan!'); }
                            else toast.error('Gagal menyimpan urutan');
                          } catch { toast.error('Gagal menyimpan urutan'); }
                          finally { setCatSortSaving(false); }
                        }}>
                        <Icon name={catSortSaving?'spinner':'floppy-disk'} size={13} spin={catSortSaving} className="fn-icon-mr"/> {catSortSaving?'Menyimpan...':'Simpan Urutan'}
                      </button>
                    )}
                    <button className="btn-primary-fn" onClick={()=>{setEditCategory({});setShowCategoryModal(true);}}>
                      <Icon name="plus" size={14} className="fn-icon-mr"/> Tambah Kategori
                    </button>
                  </div>
                </div>
                <div className="adm-cat-grid">
                  {categories.map((c,idx)=>(
                    <div key={c.id} className="admin-card adm-cat-card">
                      <div className="adm-cat-card-head">
                        <div className="adm-cat-card-left">
                          <div className="adm-sort-col">
                            <button
                              disabled={idx===0}
                              onClick={()=>{
                                if(idx===0) return;
                                const reordered=[...categories];
                                [reordered[idx-1],reordered[idx]]=[reordered[idx],reordered[idx-1]];
                                setCategories(reordered);
                                setCatSortDirty(true);
                              }}
                              className="adm-sort-btn">
                              ↑
                            </button>
                            <span className="adm-sort-index-light">{idx+1}</span>
                            <button
                              disabled={idx===categories.length-1}
                              onClick={()=>{
                                if(idx===categories.length-1) return;
                                const reordered=[...categories];
                                [reordered[idx],reordered[idx+1]]=[reordered[idx+1],reordered[idx]];
                                setCategories(reordered);
                                setCatSortDirty(true);
                              }}
                              className="adm-sort-btn">
                              ↓
                            </button>
                          </div>
                          <span className="adm-cat-dot" style={{'--c': CATEGORY_COLOR_MAP[c.color]||'var(--primary)'}}/>
                          <div>
                            <p className="adm-cat-name">{c.name}</p>
                            <p className="adm-cat-count">{c.product_count||0} produk</p>
                          </div>
                        </div>
                        <div className="adm-row-actions">
                          <button onClick={()=>{setEditCategory(c);setShowCategoryModal(true);}} className="adm-icon-btn sm edit">
                            <Icon name="pen" size={13}/>
                          </button>
                          <button onClick={()=>del(`/api/admin/categories?id=${c.id}`,'Hapus kategori ini?')} className="adm-icon-btn sm delete">
                            <Icon name="trash" size={13}/>
                          </button>
                        </div>
                      </div>
                      {c.description&&<p className="adm-cat-desc">{c.description}</p>}
                    </div>
                  ))}
                  {categories.length===0&&<p className="adm-empty-text-sm">Belum ada kategori</p>}
                </div>
              </div>
            )}

            {/* ═══ REDEEM ══════════════════════════════════ */}
            {tab==='redeem' && (
              <div className="adm-stack">
                <div className="adm-tab-header">
                  <p className="adm-tab-header-text">{codes.length} kode aktif</p>
                  <button className="btn-primary-fn" onClick={()=>setShowRedeemModal(true)}>
                    <Icon name="plus" size={14} className="fn-icon-mr"/> Buat Kode
                  </button>
                </div>
                <div className="admin-card adm-table-card">
                  <div className="adm-table-scroll">
                    <table className="admin-table min-w-[600px]">
                      <thead><tr>{['Kode','Diskon','Maks','Terpakai','Kadaluarsa','Aksi'].map(h=><th key={h}>{h}</th>)}</tr></thead>
                      <tbody>
                        {codes.map(c=>(
                          <tr key={c.id}>
                            <td>
                              <div className="adm-code-row">
                                <code className="adm-code-text">{c.code}</code>
                                <button onClick={()=>{navigator.clipboard?.writeText(c.code);toast.success('Kode disalin!');}} className="adm-icon-btn plain">
                                  <Icon name="copy" size={13}/>
                                </button>
                              </div>
                            </td>
                            <td className="adm-td-green">{c.discount_type==='percent'?`${c.discount_value}%`:idr(c.discount_value)}</td>
                            <td className="adm-td-muted">{c.max_uses}x</td>
                            <td className="adm-td-muted">{c.used_count||0}x</td>
                            <td className="adm-td-muted text-xs">{c.expires_at?fmt(c.expires_at):'∞ Tidak ada'}</td>
                            <td>
                              <button onClick={()=>del(`/api/admin/redeem?id=${c.id}`,'Hapus kode ini?')} className="adm-icon-btn sm delete">
                                <Icon name="trash" size={13}/>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {codes.length===0&&<div className="adm-table-empty">Belum ada kode redeem</div>}
                  </div>
                </div>
              </div>
            )}

            {/* ═══ LOG TRANSAKSI ═══════════════════════════ */}
            {tab==='orders' && (
              <div className="adm-stack">
                {/* Stats strip */}
                <div className="adm-stats-strip">
                  {[
                    {label:'Total',   val:stats.total,         col:'#3498db'},
                    {label:'Sukses',  val:stats.success,       col:'#2ecc71'},
                    {label:'Pending', val:stats.pending,       col:'#f1c40f'},
                    {label:'Revenue', val:idr(stats.revenue),  col:'var(--primary)'},
                  ].map((s,i)=>(
                    <div key={i} className="adm-stat-pill">
                      <span className="adm-stat-pill-val" style={{'--c': s.col}}>{s.val}</span>
                      <span className="adm-stat-pill-label">{s.label}</span>
                    </div>
                  ))}
                </div>
                {/* Filter + Action buttons */}
                <div className="adm-filter-row">
                  {['all','pending','success','failed','expired'].map(s=>(
                    <button key={s} onClick={()=>setOrderFilter(s)}
                      className={cx('adm-filter-btn', orderFilter===s && 'active')}>
                      {s.toUpperCase()}
                    </button>
                  ))}
                  <div className="adm-filter-actions">
                    <button className="btn-ghost-fn adm-danger-ghost"
                      onClick={async()=>{
                        if(!confirm('Hapus SEMUA log transaksi sekarang?\n\nSemua order akan diarsipkan ke Discord lalu dihapus permanen.\n\nTidak bisa dibatalkan!')) return;
                        const r=await af('/api/admin/orders',{method:'POST',body:JSON.stringify({action:'delete_all'})});
                        if(r.success) { toast.success(`${r.deleted} order dihapus`); load(); }
                        else toast.error(r.message||'Gagal');
                      }}>
                      <Icon name="trash" size={13} className="fn-icon-mr"/> Hapus Semua
                    </button>
                  </div>
                </div>
                <div className="admin-card adm-table-card">
                  <div className="adm-table-scroll">
                    <table className="admin-table min-w-[820px]">
                      <thead><tr>{['Order ID','Player','Discord','Produk','Total','Status','Plugin','Tanggal','Aksi'].map(h=><th key={h}>{h}</th>)}</tr></thead>
                      <tbody>
                        {orders.map(o=>(
                          <tr key={o.order_id}>
                            <td><code className="adm-order-id-code">{o.order_id}</code></td>
                            <td className="adm-cell-name">{o.player_username}</td>
                            <td className="adm-td-discord">{o.discord_username||<span className="adm-td-muted">—</span>}</td>
                            <td className="adm-td-truncate">{o.product_name}</td>
                            <td className="adm-cell-price whitespace-nowrap">{idr(o.amount)}</td>
                            <td><span className={`admin-badge ${ORDER_STATUS_BADGE[o.payment_status]||'admin-badge-gray'}`}>{o.payment_status?.toUpperCase()}</span></td>
                            <td>
                              <span className={cx('adm-plugin-status', o.plugin_notified&&'sent', !o.plugin_notified&&o.plugin_queued&&'queued')}>
                                {o.plugin_notified?'✅ Terkirim':o.plugin_queued?'⏳ Antri':'—'}
                              </span>
                            </td>
                            <td className="adm-td-date">{fmt(o.created_at)}</td>
                            <td>
                              {o.payment_status==='success'&&!o.plugin_notified&&(
                                <button className="btn-primary-fn adm-btn-xs"
                                  onClick={async()=>{
                                    const r=await af('/api/admin/orders',{method:'POST',body:JSON.stringify({orderId:o.order_id,action:'retry_plugin'})});
                                    if(r.success)toast.success('Plugin dinotifikasi!'); else toast.error('Gagal: '+(r.result?.error||'unknown'));
                                    load();
                                  }}>
                                  <Icon name="paper-plane" size={13} className="fn-icon-mr"/> Kirim
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {orders.length===0&&<div className="adm-table-empty">Belum ada transaksi</div>}
                  </div>
                </div>
              </div>
            )}

            {/* ═══ REPORTS ═════════════════════════════════ */}
            {tab==='reports' && (
              <div className="adm-stack">
                {/* Filter + Cleanup button */}
                <div className="adm-filter-row">
                  {['all','open','in_review','resolved','rejected'].map(s=>(
                    <button key={s} onClick={()=>setReportFilter(s)}
                      className={cx('adm-filter-btn', reportFilter===s && 'active')}>
                      {s==='all'?'SEMUA':TICKET_STATUS_LABEL[s]?.toUpperCase()||s.toUpperCase()}
                    </button>
                  ))}
                  {/* Manual cleanup trigger */}
                  <button className="btn-ghost-fn ml-auto text-xs"
                    onClick={async()=>{
                      const r = await af('/api/cron/cleanup',{method:'POST'});
                      if(r.success) { toast.success(r.message||'Cleanup selesai'); load(); }
                      else toast.error(r.message||'Cleanup gagal');
                    }}>
                    <Icon name="broom" size={13} className="fn-icon-mr"/> Jalankan Cleanup
                  </button>
                </div>

                {tickets.length===0 ? (
                  <div className="adm-empty-block">
                    <Icon name="inbox" size={36} className="adm-empty-icon"/>
                    <p>Belum ada tiket {reportFilter!=='all'&&`(${reportFilter})`}</p>
                  </div>
                ) : (
                  <div className="adm-stack">
                    {tickets.map(tk=>(
                      <TicketCard key={tk.ticket_id} tk={tk} af={af} onRefresh={load}/>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── SETTINGS TAB ── */}
            {tab==='settings' && (
              <div>
                <div className="adm-settings-head">
                  <h2 className="font-space adm-settings-title"><Icon name="gear" size={16} color="var(--primary)" className="fn-icon-mr-8"/>Pengaturan Website</h2>
                </div>
                <div className="adm-settings-grid">
                  {/* Logo Upload */}
                  <div className="adm-settings-box accent">
                    <h3 className="font-space adm-settings-box-title accent">
                      <Icon name="image" size={13} className="fn-icon-mr"/>LOGO &amp; FAVICON
                    </h3>
                    <p className="adm-settings-desc">
                      Logo ini digunakan di Navbar dan secara otomatis juga menjadi Favicon browser. Ukuran disarankan: <strong className="adm-settings-strong">256×256px</strong> atau <strong className="adm-settings-strong">512×512px</strong>, format PNG transparan.
                    </p>
                    <ImageUpload
                      value={settings.logo_url||''}
                      onChange={url => setSettings(s=>({...s, logo_url: url}))}
                      label="Upload Logo (Navbar + Favicon)"
                      hint="PNG transparan disarankan · Maks 2MB · 256×256 atau 512×512px"
                      previewSize={96}
                      adminToken={typeof window!=='undefined' ? localStorage.getItem('admin_token')||'' : ''}
                    />
                  </div>

                  {/* General settings */}
                  <div className="adm-settings-box plain">
                    <h3 className="font-space adm-settings-box-title plain">
                      <Icon name="server" size={13} className="fn-icon-mr"/>INFORMASI SERVER
                    </h3>
                    <div className="adm-settings-fields-grid">
                      {[
                        ['server_name','Nama Server','Fancy Network'],
                        ['server_ip','IP Java','play.example.com'],
                        ['bedrock_ip','IP Bedrock','play.example.com'],
                        ['bedrock_port','Port Bedrock','19026'],
                        ['logo_text','Teks Logo','Fancy Network'],
                        ['hero_title','Judul Hero',''],
                        ['famous_apply_url','URL Pendaftaran Rank Famous','https://discord.gg/...'],
                      ].map(([key,lbl,ph])=>(
                        <div key={key}>
                          <label className="adm-settings-field-label">{lbl}</label>
                          <input className="admin-input" value={settings[key]||''} placeholder={ph}
                            onChange={e=>setSettings(s=>({...s,[key]:e.target.value}))}/>
                        </div>
                      ))}
                      <div className="adm-settings-field-full">
                        <label className="adm-settings-field-label">URL API Status Minecraft</label>
                        <input className="admin-input" value={settings.mc_status_url||''} placeholder="https://api.mcsrvstat.us/3/play.example.com:19132"
                          onChange={e=>setSettings(s=>({...s,mc_status_url:e.target.value}))}/>
                        <p className="adm-field-hint">Dipakai untuk jumlah pemain dan indikator online di halaman utama.</p>
                      </div>
                      <div className="adm-settings-field-full">
                        <label className="adm-settings-field-label">Subtitle Hero</label>
                        <input className="admin-input" value={settings.hero_subtitle||''} placeholder="Deskripsi singkat server..."
                          onChange={e=>setSettings(s=>({...s,hero_subtitle:e.target.value}))}/>
                      </div>
                      <div className="adm-settings-field-full">
                        <label className="adm-settings-field-label">Deskripsi Server (untuk SEO &amp; Discord/Twitter embed)</label>
                        <textarea className="admin-input" rows={3} value={settings.server_description||''}
                          placeholder="Fancy Network — Server Minecraft Indonesia dengan fitur Economy, RPG, dan Keep Inventory..."
                          onChange={e=>setSettings(s=>({...s,server_description:e.target.value}))}/>
                      </div>
                    </div>
                  </div>

                  {/* Save button */}
                  <button
                    className="btn-primary-fn adm-settings-submit"
                    disabled={settingsSaving}
                    onClick={async()=>{
                      setSettingsSaving(true);
                      try {
                        const r = await af('/api/admin/settings', {method:'PUT', body:JSON.stringify(settings)});
                        if(r.success) toast.success('Pengaturan disimpan!');
                        else toast.error(r.message||'Gagal menyimpan');
                      } catch { toast.error('Error menyimpan pengaturan'); }
                      setSettingsSaving(false);
                    }}
                  >
                    {settingsSaving
                      ? <><Icon name="spinner" size={14} spin className="fn-icon-mr"/> Menyimpan...</>
                      : <><Icon name="floppy-disk" size={14} className="fn-icon-mr"/> Simpan Pengaturan</>}
                  </button>
                </div>
              </div>
            )}

          </div>
        </main>
      </div>

      {/* ── MODALS ── */}
      {showProductModal  && <ProductModal  product={editProduct}   categories={categories} af={af} onClose={()=>{setShowProductModal(false);setEditProduct(null);}}    onDone={()=>{setShowProductModal(false);load();}}/>}
      {showCategoryModal && <CategoryModal category={editCategory} af={af}                 onClose={()=>{setShowCategoryModal(false);setEditCategory(null);}}            onDone={()=>{setShowCategoryModal(false);load();}}/>}
      {showRedeemModal   && <RedeemModal   af={af}                                          onClose={()=>setShowRedeemModal(false)}                                        onDone={()=>{setShowRedeemModal(false);load();}}/>}
    </>
  );
}

// ── TicketCard ────────────────────────────────────────────────
function TicketCard({ tk, af, onRefresh }) {
  const [expanded,  setExpanded]  = useState(false);
  const [liveTicket, setLiveTicket] = useState(tk);
  const [msg,       setMsg]       = useState('');
  const [sending,   setSending]   = useState(false);
  const [timeLeft,  setTimeLeft]  = useState(null);  // detik tersisa sebelum cleanup
  const msgEndRef = useRef(null);

  const tInfo = {
    banding:{icon:'gavel',color:'#e67e22'}, bug:{icon:'bug',color:'#3498db'},
    report_player:{icon:'user-xmark',color:'#e74c3c'}, lainnya:{icon:'comment-dots',color:'#9b59b6'},
  }[liveTicket.type] || {icon:'ticket',color:'var(--primary)'};

  const st = {
    open:{label:'Menunggu',color:'#f1c40f'}, in_review:{label:'Review',color:'#3498db'},
    resolved:{label:'Selesai',color:'#2ecc71'}, rejected:{label:'Ditolak',color:'#e74c3c'},
    expired:{label:'Expired',color:'#95a5a6'},
  }[liveTicket.status] || {label:liveTicket.status,color:'#8e8e9a'};

  useEffect(() => { setLiveTicket(tk); }, [tk]);

  // Saat chat admin dibuka, sinkronkan balasan Discord setiap 5 detik.
  useEffect(() => {
    if (!expanded || !liveTicket.ticket_id) return undefined;
    let active = true;
    const sync = async () => {
      try {
        const result = await af(`/api/admin/support?id=${encodeURIComponent(liveTicket.ticket_id)}`);
        if (active && result?.success && result.ticket) setLiveTicket(result.ticket);
      } catch {}
    };
    sync();
    const interval = window.setInterval(sync, 5000);
    return () => { active = false; window.clearInterval(interval); };
  }, [af, expanded, liveTicket.ticket_id]);

  // Hitung countdown 2 menit untuk closed ticket
  useEffect(() => {
    if (!liveTicket.closed_at) { setTimeLeft(null); return; }
    const closedMs  = new Date(liveTicket.closed_at).getTime();
    const TWO_MIN   = 2 * 60 * 1000;
    const tick = () => {
      const left = Math.max(0, TWO_MIN - (Date.now() - closedMs));
      setTimeLeft(left);
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [liveTicket.closed_at]);

  // Scroll ke pesan terbaru saat expand
  useEffect(() => {
    if (expanded && msgEndRef.current) {
      msgEndRef.current.scrollIntoView({ behavior:'smooth' });
    }
  }, [expanded, liveTicket.messages?.length]);

  const sendMsg = async () => {
    if (!msg.trim() || sending) return;
    setSending(true);
    await af('/api/admin/support', { method:'PATCH', body:JSON.stringify({ id:liveTicket.ticket_id, message:msg.trim() }) });
    setSending(false);
    setMsg('');
    onRefresh();
  };

  const cancelCleanup = async () => {
    await af('/api/admin/support', { method:'PATCH', body:JSON.stringify({ id:liveTicket.ticket_id, cancel_cleanup:true }) });
    toast.success('Auto-cleanup dibatalkan');
    onRefresh();
  };

  const fmtTime = secs => {
    if (secs === null) return '';
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2,'0')}`;
  };

  const isClosed = liveTicket.status === 'resolved' || liveTicket.status === 'rejected';
  const msgs = liveTicket.messages || [];

  return (
    <div className={cx('admin-card adm-ticket-card', isClosed && liveTicket.closed_at && 'closing')}>

      {/* Countdown cleanup banner */}
      {isClosed && liveTicket.closed_at && timeLeft !== null && (
        <div className="adm-cleanup-banner">
          <div className="adm-cleanup-left">
            <Icon name="clock" size={13} color="#e74c3c" className="fn-icon-mr-4"/>
            {timeLeft > 0
              ? <span className="adm-cleanup-text">
                  Auto-cleanup dalam <strong>{fmtTime(Math.ceil(timeLeft/1000))}</strong> — arsip akan dikirim ke webhook
                </span>
              : <span className="adm-cleanup-waiting">Menunggu cleanup job...</span>
            }
          </div>
          {timeLeft > 0 && (
            <button onClick={cancelCleanup} className="adm-cleanup-cancel-btn">
              ✕ Batalkan
            </button>
          )}
        </div>
      )}

      {/* Header */}
      <div className="adm-ticket-head">
        <div className="adm-ticket-head-left">
          <div className="adm-ticket-icon" style={{'--c': `${tInfo.color}18`}}>
            <Icon name={tInfo.icon} size={14} color={tInfo.color}/>
          </div>
          <div className="min-w-0">
            <p className="adm-ticket-subject">{liveTicket.subject}</p>
            <div className="adm-ticket-meta">
              <code className="adm-ticket-meta-text adm-mono">{liveTicket.ticket_id}</code>
              <span className="adm-ticket-meta-text">·</span>
              <span className="adm-ticket-player">{liveTicket.player_username}</span>
              <span className="adm-ticket-meta-text">·</span>
              <span className="adm-ticket-meta-text">{fmt(liveTicket.created_at)}</span>
              {msgs.length > 0 && <span className="adm-ticket-msgcount-badge">{msgs.length} pesan</span>}
              {liveTicket.discord_channel_id && <span className="adm-ticket-msgcount-badge">Discord sync</span>}
            </div>
          </div>
        </div>
        <div className="adm-ticket-head-right">
          <button onClick={()=>setExpanded(!expanded)} className="adm-ticket-toggle-btn">
            <Icon name={expanded?'chevron-up':'chevron-down'} size={10}/>
            {expanded ? 'Tutup' : 'Buka Chat'}
          </button>
          <select value={liveTicket.status} onChange={async e=>{
            await af('/api/admin/support',{method:'PATCH',body:JSON.stringify({id:liveTicket.ticket_id,status:e.target.value})});
            toast.success('Status diupdate'); onRefresh();
          }} className="adm-ticket-status-select" style={{'--c': st.color}}>
            <option value="open">Menunggu</option>
            <option value="in_review">Review</option>
            <option value="resolved">Selesai</option>
            <option value="rejected">Ditolak</option>
          </select>
        </div>
      </div>

      {liveTicket.target_player && <p className="adm-ticket-target"><Icon name="user-xmark" size={12} className="fn-icon-mr"/>Target: <strong>{liveTicket.target_player}</strong></p>}
      {liveTicket.evidence_url  && <a href={liveTicket.evidence_url} target="_blank" rel="noopener noreferrer" className="adm-ticket-evidence-link"><Icon name="link" size={12} className="fn-icon-mr"/>Lihat Bukti</a>}

      {/* Chat area - expanded */}
      {expanded && (
        <div className="adm-chat-wrap">
          {/* Messages */}
          <div className="adm-chat-messages">
            {msgs.length === 0 && <p className="adm-chat-empty">Belum ada percakapan</p>}
            {msgs.map((m,i) => {
              const isAdmin = m.sender_type === 'admin';
              return (
                <div key={m.id||i} className={cx('adm-chat-row', isAdmin && 'admin')}>
                  <div className={cx('adm-chat-bubble', isAdmin && 'admin')}>
                    <p className={cx('adm-chat-sender', isAdmin && 'admin')}>
                      {isAdmin ? '👑 Admin' : `👤 ${m.sender}`}
                    </p>
                    <p className="adm-chat-text">{m.text}</p>
                  </div>
                  <span className="adm-chat-time">{fmt(m.created_at)}</span>
                </div>
              );
            })}
            <div ref={msgEndRef}/>
          </div>

          {/* Reply input */}
          {!isClosed && (
            <div className="adm-chat-input-row">
              <textarea value={msg} onChange={e=>setMsg(e.target.value)} rows={2}
                onKeyDown={e=>{ if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMsg();} }}
                placeholder="Tulis balasan... (Enter kirim, Shift+Enter baris baru)"
                className="admin-input adm-chat-textarea"/>
              <button disabled={sending||!msg.trim()} className="btn-primary-fn adm-chat-send-btn" onClick={sendMsg}>
                {sending ? <Icon name="spinner" size={13} spin/> : <><Icon name="paper-plane" size={13} className="fn-icon-mr"/> Kirim</>}
              </button>
            </div>
          )}
          {isClosed && <p className="adm-chat-closed-note">Tiket ditutup — tidak bisa membalas</p>}
        </div>
      )}
    </div>
  );
}
// ── MODAL helpers ─────────────────────────────────────────────
function ModalWrap({ title, onClose, children }) {
  return (
    <div className="adm-modal-overlay">
      <div className="adm-modal-box">
        <div className="adm-modal-topbar"/>
        <div className="adm-modal-body">
          <div className="adm-modal-head">
            <h2 className="adm-modal-title">{title}</h2>
            <button onClick={onClose} className="adm-modal-close">
              <Icon name="xmark" size={14}/>
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return <div className="adm-field-wrap"><label className="admin-label">{label}</label>{children}</div>;
}

// ── ProductModal ──────────────────────────────────────────────
function ProductModal({ product, categories, af, onClose, onDone }) {
  const isEdit = !!product?.id;
  const pf = v => { try { const p=typeof v==='string'?JSON.parse(v):v; return Array.isArray(p)?p.join('\n'):''; } catch { return ''; } };
  // Hitung discount_percent dari existing data (untuk mode edit)
  const existingDiscount = product?.discount_percent || (
    product?.original_price > product?.price
      ? Math.round((1 - product.price / product.original_price) * 100)
      : 0
  );
  const [f, setF] = useState({
    id:product?.id||null, name:product?.name||'', category_id:product?.category_id||'',
    description:product?.description||'', price:product?.price||'',
    discount_percent: existingDiscount || '',
    badge:product?.badge||'', badge_color:product?.badge_color||'orange',
    reward_trigger:product?.reward_trigger||'', purchase_limit:product?.purchase_limit||0,
    limit_scope:product?.limit_scope||'per_product', sort_order:product?.sort_order||0,
    is_active:product?.is_active!==undefined?!!product.is_active:true, features:pf(product?.features),
  });
  const [saving, setSaving] = useState(false);

  // Preview: harga asli (coret) dihitung dari harga jual + diskon
  const priceNum   = parseInt(f.price) || 0;
  const discNum    = parseInt(f.discount_percent) || 0;
  const origPrice  = discNum > 0 && discNum < 100 ? Math.round(priceNum / (1 - discNum / 100)) : 0;

  const submit = async e => {
    e.preventDefault(); setSaving(true);
    const r = await af('/api/admin/products',{method:isEdit?'PUT':'POST',body:JSON.stringify({
      ...f, price:parseInt(f.price)||0,
      discount_percent: parseInt(f.discount_percent)||0,
      purchase_limit:parseInt(f.purchase_limit)||0, sort_order:parseInt(f.sort_order)||0,
      category_id:f.category_id?parseInt(f.category_id):null, is_active:f.is_active?1:0,
      features:f.features.split('\n').filter(Boolean),
    })});
    setSaving(false);
    if(r.success){toast.success(isEdit?'Produk diupdate!':'Produk ditambahkan!');onDone();}
    else toast.error(r.message||'Gagal');
  };

  return (
    <ModalWrap title={isEdit?'Edit Produk':'Tambah Produk Baru'} onClose={onClose}>
      <form onSubmit={submit} className="adm-modal-form-scroll">
        <div className="adm-form-grid2">
          <div className="adm-form-col-full"><Field label="Nama Produk *"><input value={f.name} onChange={e=>setF(p=>({...p,name:e.target.value}))} className="admin-input" required/></Field></div>
          <Field label="Kategori"><select value={f.category_id} onChange={e=>setF(p=>({...p,category_id:e.target.value}))} className="admin-input">
            <option value="">— Pilih —</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
          </select></Field>
          <Field label="Harga (Rp) *"><input type="number" value={f.price} onChange={e=>setF(p=>({...p,price:e.target.value}))} className="admin-input" required/></Field>
          <Field label="Diskon (%)">
            <div className="adm-discount-wrap">
              <input type="number" min="0" max="99" value={f.discount_percent}
                onChange={e=>setF(p=>({...p,discount_percent:e.target.value}))}
                className="admin-input" placeholder="0 = tidak ada diskon"/>
              <span className="adm-discount-pct">%</span>
            </div>
            {discNum > 0 && priceNum > 0 && (
              <div className="adm-discount-preview">
                <span className="adm-discount-old">{idr(origPrice)}</span>
                <span className="adm-discount-arrow">→</span>
                <span className="adm-discount-new">{idr(priceNum)}</span>
                <span className="adm-discount-badge">-{discNum}%</span>
              </div>
            )}
          </Field>
          <Field label="Reward Trigger">
            <input value={f.reward_trigger} onChange={e=>setF(p=>({...p,reward_trigger:e.target.value}))} className="admin-input adm-mono" placeholder="contoh: rank_vip"/>
            <p className="adm-field-hint">ID reward di config.yml plugin FancyNetworkAPI</p>
          </Field>
          <div className="adm-form-col-full"><Field label="Deskripsi"><textarea value={f.description} onChange={e=>setF(p=>({...p,description:e.target.value}))} className="admin-input adm-textarea-noresize" rows={2}/></Field></div>
          <div className="adm-form-col-full"><Field label="Fitur/Benefit (satu per baris)"><textarea value={f.features} onChange={e=>setF(p=>({...p,features:e.target.value}))} className="admin-input adm-textarea-noresize" rows={4} placeholder={"Prefix [VIP]\nKit setiap hari\nFly di spawn"}/></Field></div>
          <Field label="Badge Text">
            <input value={f.badge} onChange={e=>setF(p=>({...p,badge:e.target.value}))} className="admin-input" placeholder="BEST SELLER"/>
            <p className="adm-field-hint">Contoh: BEST SELLER, TERLARIS, NEW, LIMITED.</p>
          </Field>
          <Field label="Badge Warna">
            <select value={f.badge_color} onChange={e=>setF(p=>({...p,badge_color:e.target.value}))} className="admin-input">
              <option value="green">Hijau Fancy</option>
              <option value="yellow">Kuning / Gold</option>
              <option value="orange">Oranye</option>
              <option value="red">Merah</option>
              <option value="purple">Ungu</option>
              <option value="blue">Biru</option>
            </select>
          </Field>
          <Field label="Batas Beli"><input type="number" min="0" value={f.purchase_limit} onChange={e=>setF(p=>({...p,purchase_limit:e.target.value}))} className="admin-input"/>
            <p className="adm-field-hint mt4">0 = tidak terbatas</p>
          </Field>
          <Field label="Scope Batas"><select value={f.limit_scope} onChange={e=>setF(p=>({...p,limit_scope:e.target.value}))} className="admin-input">
            <option value="per_product">Per produk</option>
            <option value="per_category">Per kategori</option>
            <option value="global">Semua produk</option>
          </select></Field>
        </div>
        <div className="adm-toggle-row spaced">
          <label className="toggle-switch"><input type="checkbox" checked={f.is_active} onChange={e=>setF(p=>({...p,is_active:e.target.checked}))}/><span className="toggle-slider"/></label>
          <span className={cx('adm-toggle-label', f.is_active && 'active')}>{f.is_active?'Produk Aktif':'Nonaktif'}</span>
        </div>
        <div className="adm-modal-actions">
          <button type="button" onClick={onClose} className="btn-ghost-fn adm-modal-btn-flex">Batal</button>
          <button type="submit" disabled={saving} className="btn-primary-fn adm-modal-btn-flex">
            {saving?<><Icon name="spinner" size={14} spin className="fn-icon-mr"/> Menyimpan...</>:<><Icon name="floppy-disk" size={14} className="fn-icon-mr"/> {isEdit?'Update':'Tambah'} Produk</>}
          </button>
        </div>
      </form>
    </ModalWrap>
  );
}

// ── CategoryModal ─────────────────────────────────────────────
function CategoryModal({ category, af, onClose, onDone }) {
  const isEdit = !!category?.id;
  const [f, setF] = useState({id:category?.id||null,name:category?.name||'',color:category?.color||'orange',description:category?.description||'',sort_order:category?.sort_order||0,is_active:category?.is_active!==undefined?!!category.is_active:true});
  const [saving, setSaving] = useState(false);

  const submit = async e => {
    e.preventDefault(); setSaving(true);
    const r = await af('/api/admin/categories',{method:isEdit?'PUT':'POST',body:JSON.stringify({...f,is_active:f.is_active?1:0})});
    setSaving(false);
    if(r.success){toast.success(isEdit?'Kategori diupdate!':'Kategori ditambahkan!');onDone();}
    else toast.error(r.message||'Gagal');
  };

  return (
    <ModalWrap title={isEdit?'Edit Kategori':'Tambah Kategori'} onClose={onClose}>
      <form onSubmit={submit} className="adm-form-col">
        <Field label="Nama *"><input value={f.name} onChange={e=>setF(p=>({...p,name:e.target.value}))} className="admin-input" required/></Field>
        <div className="adm-form-grid2">
          <Field label="Warna"><select value={f.color} onChange={e=>setF(p=>({...p,color:e.target.value}))} className="admin-input">
            {['orange','red','purple','blue','green','yellow'].map(c=><option key={c} value={c}>{c}</option>)}
          </select></Field>
        </div>
        <Field label="Deskripsi"><input value={f.description} onChange={e=>setF(p=>({...p,description:e.target.value}))} className="admin-input"/></Field>
        <div className="adm-toggle-row">
          <label className="toggle-switch"><input type="checkbox" checked={f.is_active} onChange={e=>setF(p=>({...p,is_active:e.target.checked}))}/><span className="toggle-slider"/></label>
          <span className={cx('adm-toggle-label', f.is_active && 'active')}>{f.is_active?'Aktif':'Nonaktif'}</span>
        </div>
        <div className="adm-modal-actions mt">
          <button type="button" onClick={onClose} className="btn-ghost-fn adm-modal-btn-flex">Batal</button>
          <button type="submit" disabled={saving} className="btn-primary-fn adm-modal-btn-flex">
            {saving?<Icon name="spinner" size={14} spin/>:<><Icon name="floppy-disk" size={14} className="fn-icon-mr"/> Simpan</>}
          </button>
        </div>
      </form>
    </ModalWrap>
  );
}

// ── RedeemModal ───────────────────────────────────────────────
function RedeemModal({ af, onClose, onDone }) {
  const [f, setF] = useState({code:'',discount_type:'percent',discount_value:'',max_uses:1,min_price:0,expires_at:''});
  const [saving, setSaving] = useState(false);
  const gen = () => { const c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; setF(p=>({...p,code:Array.from({length:8},()=>c[Math.floor(Math.random()*c.length)]).join('')})); };

  const submit = async e => {
    e.preventDefault(); setSaving(true);
    const r = await af('/api/admin/redeem',{method:'POST',body:JSON.stringify(f)});
    setSaving(false);
    if(r.success){toast.success('Kode dibuat!');onDone();}
    else toast.error(r.message||'Gagal');
  };

  return (
    <ModalWrap title="Buat Kode Redeem" onClose={onClose}>
      <form onSubmit={submit} className="adm-form-col">
        <Field label="Kode *">
          <div className="adm-code-gen-row">
            <input value={f.code} onChange={e=>setF(p=>({...p,code:e.target.value.toUpperCase()}))} className="admin-input adm-code-input" placeholder="DISKON20" required/>
            <button type="button" onClick={gen} className="btn-ghost-fn adm-gen-btn">Auto</button>
          </div>
        </Field>
        <div className="adm-form-grid2">
          <Field label="Tipe Diskon"><select value={f.discount_type} onChange={e=>setF(p=>({...p,discount_type:e.target.value}))} className="admin-input">
            <option value="percent">Persen (%)</option><option value="fixed">Nominal (Rp)</option>
          </select></Field>
          <Field label={`Nilai ${f.discount_type==='percent'?'(%)':'(Rp)'} *`}>
            <input type="number" value={f.discount_value} onChange={e=>setF(p=>({...p,discount_value:e.target.value}))} className="admin-input" placeholder={f.discount_type==='percent'?'20':'10000'} required/>
          </Field>
          <Field label="Maks Pakai"><input type="number" min="1" value={f.max_uses} onChange={e=>setF(p=>({...p,max_uses:parseInt(e.target.value)||1}))} className="admin-input"/></Field>
          <Field label="Kadaluarsa"><input type="datetime-local" value={f.expires_at} onChange={e=>setF(p=>({...p,expires_at:e.target.value}))} className="admin-input"/></Field>
        </div>
        <div className="adm-modal-actions mt">
          <button type="button" onClick={onClose} className="btn-ghost-fn adm-modal-btn-flex">Batal</button>
          <button type="submit" disabled={saving} className="btn-primary-fn adm-modal-btn-flex">
            {saving?<Icon name="spinner" size={14} spin/>:<><Icon name="ticket" size={14} className="fn-icon-mr"/> Buat Kode</>}
          </button>
        </div>
      </form>
    </ModalWrap>
  );
}
