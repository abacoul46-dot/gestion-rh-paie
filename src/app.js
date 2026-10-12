(function () {
'use strict';
var KEY = 'gestion_rh_paie_v1';
var N = RH.N, blank = RH.blank;

// ======================================================================
//  ÉTAT ET ENREGISTREMENT
// ======================================================================
function etatInitial() { return etatVierge(''); }
var S = null;
var paramDeverrouille = false;
var LISTES = [['dept', 'Départements', 'dlDept'], ['poste', 'Postes', 'dlPoste'], ['cat', 'Catégories', 'dlCat'], ['contrat', 'Natures de contrat', 'dlContrat'], ['banque', 'Banques', 'dlBanque'], ['situation', 'Situations matrimoniales', 'dlSit']];
var LISTES_DEFAUT = { cat: ['A', 'B', 'C'], contrat: ['CDI', 'CDD', 'STAGE'], situation: ['Marié(e)', 'Célibataire', 'Divorcé(e)', 'Veuf(ve)'] };
function initListes() {
  if (S.P.listes) return;
  S.P.listes = {};
  LISTES.forEach(function (l) {
    var v = (LISTES_DEFAUT[l[0]] || []).slice();
    S.emps.forEach(function (e) { var x = String(e[l[0]] || '').trim(); if (x && v.indexOf(x) < 0) v.push(x); });
    S.P.listes[l[0]] = v;
  });
}
function listeDe(dl) { var l = LISTES.filter(function (x) { return x[2] === dl; })[0]; return l ? l[0] : null; }
var THEMES = [['vert', 'Sage vert', ['#2b333c', '#5f6d7b', '#3a9b2b', '#d4ebc3']], ['bleu', 'Sage bleu', ['#2b333c', '#5f6d7b', '#2f6fc4', '#cfe1f7']], ['gris', 'Sage gris', ['#1f252b', '#5f6d7b', '#4f5f70', '#d9dfe5']]];
function appliquerTheme() { try { var t = (S.ui && S.ui.theme) || 'vert'; if (['vert', 'bleu', 'gris'].indexOf(t) < 0) t = 'vert'; document.documentElement.setAttribute('data-app', t); } catch (e) {} }

// ======================================================================
//  OUTILS D'AFFICHAGE
// ======================================================================
function $(s, r) { return (r || document).querySelector(s); }
function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
function esc(v) { return String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function today() { return RH.todayISO(); }
function fm(v, dec) { // montant
  if (v === RH.DIV0) return '<span class="bp-err">#DIV/0!</span>';
  if (v === '' || v === null || v === undefined) return '';
  if (v === false) return '0';
  if (typeof v !== 'number') { var n = Number(v); if (!isNaN(n) && String(v).trim() !== '') v = n; else return esc(v); }
  return v.toLocaleString('fr-FR', { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 }).replace(/ | /g, ' ');
}
function fF(v) { var s = fm(v); return s === '' ? '' : s + ' F'; }
function fp(v, dec) { if (v === '' || v === null || v === undefined) return ''; if (v === RH.DIV0) return '#DIV/0!'; return (N(v) * 100).toLocaleString('fr-FR', { minimumFractionDigits: dec || 0, maximumFractionDigits: dec === undefined ? 2 : dec }) + ' %'; }
function fd(iso) { var p = RH.parseD(iso); return p ? String(p.d).padStart(2, '0') + '/' + String(p.m).padStart(2, '0') + '/' + p.y : ''; }
function rows() { var t = today(); return S.emps.map(function (e) { return { e: e, r: RH.calcLigne(e, S.P, t) }; }); }
function findEmp(mat) { for (var i = 0; i < S.emps.length; i++) if (String(S.emps[i].mat) === String(mat)) return S.emps[i]; return null; }
function nomComplet(e) { return (e.prenom || '') + ' ' + (e.nom || ''); }
function contratPill(c) { var k = String(c || '').toLowerCase(); return c ? '<span class="pill ' + (k === 'cdi' ? 'cdi' : k === 'cdd' ? 'cdd' : k === 'stage' ? 'stage' : 'sortie') + '">' + esc(c) + '</span>' : ''; }
function statutPill(s) { return '<span class="pill ' + (s === 'Actif' ? 'actif' : 'sortie') + '">' + esc(s) + '</span>'; }
function toast(msg) {
  var t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t);
  setTimeout(function () { t.remove(); }, 2600);
}
function logoHTML(h) { return S.P.logo ? '<img src="' + S.P.logo + '" alt="Logo ' + esc(S.P.nom) + '"' + (h ? ' style="max-height:' + h + 'px"' : '') + '>' : ''; }

// Fenêtre de dialogue (remplace MsgBox / InputBox)
function dialog(o) {
  var v = document.createElement('div'); v.className = 'modal-veil';
  v.innerHTML = '<div class="modal" role="dialog" aria-modal="true"><h3>' + esc(o.titre || '') + '</h3><div class="mb">' + (o.html || '') + '</div><div class="mf"></div></div>';
  var mf = $('.mf', v);
  (o.boutons || [{ t: 'OK', cls: 'pri' }]).forEach(function (b) {
    var el = document.createElement('button'); el.type = 'button'; el.className = 'btn ' + (b.cls || ''); el.textContent = b.t;
    el.onclick = function () { if (b.fn && b.fn(v) === false) return; v.remove(); };
    mf.appendChild(el);
  });
  v.addEventListener('mousedown', function (ev) { if (ev.target === v && !o.bloquant) v.remove(); });
  document.body.appendChild(v);
  var f = $('input', v); if (f) f.focus(); else $('.mf .btn:last-child', v).focus();
  return v;
}
function alerte(titre, texte, type) {
  dialog({ titre: titre, html: '<div class="note ' + (type || 'info') + '"><pre>' + esc(texte) + '</pre></div>' });
}
function confirmer(titre, html, libelle, fn, cls) {
  dialog({ titre: titre, html: html, boutons: [{ t: 'Annuler' }, { t: libelle || 'Confirmer', cls: cls || 'pri', fn: fn }] });
}

// Impression (bulletins, attestation, certificat)
function imprimer(pages, paysage) {
  var z = document.getElementById('print-zone');
  z.innerHTML = pages.map(function (h) { return '<div class="print-page' + (paysage ? ' paysage' : '') + '">' + h + '</div>'; }).join('');
  setTimeout(function () { window.print(); }, 60);
}
window.addEventListener('afterprint', function () { document.getElementById('print-zone').innerHTML = ''; });

function telecharger(nom, contenu, type) {
  var blob = new Blob([contenu], { type: type });
  var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nom;
  document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

// ======================================================================
//  ICÔNES ET NAVIGATION
// ======================================================================
var IC = {
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  form: '<path d="M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3"/><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M12 11v6M9 14h6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><circle cx="17" cy="9" r="2.6"/><path d="M16.5 14.6c2.6.2 4.4 1.9 5 5.4"/>',
  slip: '<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6M9 12h8M9 16h8M9 20h5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  doc: '<path d="M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  cert: '<circle cx="12" cy="9" r="5"/><path d="M8.5 13l-1.5 8 5-3 5 3-1.5-8"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  calc: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M8 6h8M8 11h2M12 11h2M16 11v6M8 15h2M12 15h2M8 19h6"/>',
  print: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  unlock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>',
  coins: '<ellipse cx="9" cy="6" rx="6" ry="2.5"/><path d="M3 6v4c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V6M3 10v4c0 1.4 2.7 2.5 6 2.5 1 0 2-.1 2.8-.3"/><ellipse cx="16" cy="15" rx="5" ry="2.2"/><path d="M11 15v3.5c0 1.2 2.2 2.2 5 2.2s5-1 5-2.2V15"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>', dl: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>'
};
function ic(n) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + IC[n] + '</svg>'; }
var PAGES = [
  { id: 'accueil', t: 'Accueil', ic: 'home', g: 'Général' },
  { id: 'formulaire', t: 'Formulaire', ic: 'form', g: 'Personnel' },
  { id: 'personnels', t: 'Personnels', ic: 'users', g: 'Personnel' },
  { id: 'elements', t: 'Éléments de salaire', ic: 'coins', g: 'Paie' },
  { id: 'bulletin', t: 'Bulletin de paie', ic: 'slip', g: 'Paie' },
  { id: 'heures', t: 'Heures sup', ic: 'clock', g: 'Paie' },
  { id: 'tableau', t: 'Tableau de bord', ic: 'chart', g: 'Pilotage' },
  { id: 'attestation', t: 'Attestation', ic: 'doc', g: 'Documents' },
  { id: 'certificat', t: 'Certificat', ic: 'cert', g: 'Documents' },
  { id: 'rubriques', t: 'Rubriques de paie', ic: 'calc', g: 'Réglages' },
  { id: 'parametres', t: 'Paramètres', ic: 'gear', g: 'Réglages' },
  { id: 'listes', t: 'Listes de référence', ic: 'doc', g: 'Réglages', cache: true },
  { id: 'editeur', t: 'Console des licences', ic: 'gear', g: 'Éditeur', cache: true }
];
function renderNav(cur) {
  var h = '', g = '';
  PAGES.forEach(function (p) {
    if (p.cache) return;
    if (p.g !== g) { g = p.g; h += '<div class="grp">' + g + '</div>'; }
    h += '<a href="#' + p.id + '" class="' + (p.id === cur ? 'on' : '') + '">' + ic(p.ic) + '<span>' + p.t + '</span></a>';
  });
  $('#nav').innerHTML = h;
  $('#brandLogo').innerHTML = S.P.logo ? '<img src="' + S.P.logo + '" alt="">' : '<span>' + esc(S.P.nom) + '</span>';
}
function top(eyebrow, titre, actions) {
  return '<div class="top"><div><div class="eyebrow">' + esc(eyebrow) + '</div><h1>' + esc(titre) + '</h1></div><div class="actions">' + (actions || '') + '</div></div>';
}
function route() {
  $$('.modal-veil, .veil').forEach(function (x) { x.remove(); });
  var id = (location.hash || '#accueil').slice(1);
  if (!S) return;
  if (!PAGES.some(function (p) { return p.id === id; })) id = 'accueil';
  if (id === 'editeur' && !estEditeur()) id = 'accueil';
  if (!CL.org && estEditeur()) id = 'editeur';
  renderNav(id);
  majChrome(id);
  var m = $('#main');
  ({ accueil: pAccueil, formulaire: pFormulaire, personnels: pPersonnels, elements: pElements, bulletin: pBulletin, heures: pHeures,
    tableau: pTableau, attestation: function (el) { pDoc(el, 'attestation'); }, certificat: function (el) { pDoc(el, 'certificat'); }, parametres: pParametres, rubriques: pRubriques, listes: pListes, editeur: pEditeur })[id](m);
  window.scrollTo(0, 0); m.scrollTop = 0;
}
window.addEventListener('hashchange', route);

// Sélecteur de matricule (ListeMatricules)
// Sélection d'un salarié par son nom (le matricule n'est plus à choisir)
function empsParNom() {
  return S.emps.slice().sort(function (a, b) { return (String(a.nom || '') + ' ' + String(a.prenom || '')).localeCompare(String(b.nom || '') + ' ' + String(b.prenom || ''), 'fr'); });
}
function libSal(e) {
  var r = RH.calcLigne(e, S.P, today());
  return String(e.nom || '').toUpperCase() + ' ' + (e.prenom || '') + (e.poste ? ' — ' + e.poste : '') + (r.statut !== 'Actif' ? ' (sorti)' : '');
}
function selMat(id, val, vide) {
  return '<select id="' + id + '">' + (vide ? '<option value="">— Choisir un salarié —</option>' : '') + empsParNom().map(function (e) {
    return '<option value="' + esc(e.mat) + '"' + (String(e.mat) === String(val) ? ' selected' : '') + '>' + esc(libSal(e)) + '</option>';
  }).join('') + '</select>';
}
function datalist(id, cle, base) {
  var vals = (base || []).slice();
  S.emps.forEach(function (e) { if (!blank(e[cle]) && vals.indexOf(String(e[cle])) < 0) vals.push(String(e[cle])); });
  return '<datalist id="' + id + '">' + vals.map(function (v) { return '<option value="' + esc(v) + '">'; }).join('') + '</datalist>';
}

// ======================================================================
//  ACCUEIL
// ======================================================================
function pAccueil(m) {
  var R = rows(), d = RH.tableauDeBord(R, S.P, today());
  var tiles = [
    ['formulaire', 'form', 'Formulaire', 'Enregistrer un nouveau salarié'],
    ['personnels', 'users', 'Personnels', 'Fiches du personnel, contrats, départs'],
    ['elements', 'coins', 'Éléments de salaire', 'Saisie des salaires, primes, heures sup'],
    ['bulletin', 'slip', 'Bulletin de paie', 'Éditer et imprimer les bulletins'],
    ['heures', 'clock', 'Heures sup', 'Calculer et reporter les majorations'],
    ['tableau', 'chart', 'Tableau de bord', 'Effectifs, masse salariale, turnover'],
    ['attestation', 'doc', 'Attestation de travail', 'Pour un salarié en poste'],
    ['certificat', 'cert', 'Certificat de travail', 'Pour un salarié sorti']
  ];
  var ech = d.echeances.length ? d.echeances.map(function (x) {
    return '<tr><td class="who"><b>' + esc(nomComplet(x.e)) + '</b><span>' + esc(x.e.poste) + '</span></td><td>' + contratPill(x.e.contrat) + '</td><td class="num">' + fd(x.e.fin) + '</td></tr>';
  }).join('') : '<tr><td colspan="3" style="color:var(--muted)">Aucun contrat à échéance.</td></tr>';
  m.innerHTML = top('Bienvenue', S.P.nom) +
    '<div class="welcome"><div><h2>Gestion RH &amp; Paie</h2><p>' + esc(S.P.adresse) + ' — ' + esc(S.P.ville) + ' · Tél. ' + esc(S.P.tel) + ' · ' + esc(S.P.email) + '</p></div>' +
    '<div class="per"><small>Période de paie</small><b>du ' + fd(S.periode.debut) + ' au ' + fd(S.periode.fin) + '</b></div></div>' +
    '<div class="kpis" style="margin-top:10px">' +
    kpi('Effectif actif', d.effectif, '', d.genre.F + ' F · ' + d.genre.H + ' H', true) +
    kpi('Masse salariale', fm(d.masse), 'F CFA', 'mensuelle, salariés actifs') +
    kpi('Salaire moyen', fm(d.salaireMoyen), 'F CFA', 'coût employeur moyen') +
    kpi('Âge moyen', fm(d.ageMoyen), 'ans', '') +
    kpi('Ancienneté moyenne', fm(d.ancMoyenne), 'ans', '') +
    kpi('Turnover ' + d.annee, fp(d.turnover), '', d.departs + ' départ(s)') + '</div>' +
    '<div class="grid" style="grid-template-columns:minmax(0,2fr) minmax(0,1fr);margin-top:10px" id="accGrid">' +
    '<div class="tiles" style="grid-template-columns:repeat(3,minmax(0,1fr))">' + tiles.map(function (t) {
      return '<a class="tile" href="#' + t[0] + '"><div class="ic">' + ic(t[1]) + '</div><b>' + t[2] + '</b><span>' + t[3] + '</span></a>';
    }).join('') + '</div>' +
    '<div class="panel"><div class="panel-h"><h2>Prochains contrats à échéance</h2></div><div class="tbl-wrap"><table class="tbl"><tbody>' + ech + '</tbody></table></div>' +
    '<div class="panel-b"><div class="note info">Les données sont enregistrées en ligne automatiquement, avec une copie sur cet ordinateur pour travailler sans connexion. Ajoutez vos collaborateurs par Fichier › Utilisateurs de l\'entreprise.</div></div></div></div>';
  if (window.innerWidth < 900) $('#accGrid').style.gridTemplateColumns = 'minmax(0,1fr)';
}
function kpi(l, v, unit, s, hero) {
  return '<div class="kpi' + (hero ? ' hero' : '') + '"><div class="l">' + esc(l) + '</div><div class="v">' + v + (unit ? '<small>' + unit + '</small>' : '') + '</div><div class="s">' + esc(s || '') + '</div></div>';
}

// ======================================================================
//  FORMULAIRE (feuille Formulaire + macro Ajouter)
// ======================================================================
var CHAMPS_FORM = [ // ordre et libellés de la feuille Formulaire
  ['mat', 'N° Matricule'], ['entree', "Date d'entrée", 'date'],
  ['prenom', 'Prénom'], ['contrat', 'Nature du contrat', 'text', 'dlContrat'],
  ['nom', 'Nom'], ['poste', 'Poste', 'text', 'dlPoste'],
  ['naissance', 'Date de Naissance', 'date'], ['dept', 'Département', 'text', 'dlDept'],
  ['situation', 'Situation matrim.', 'text', 'dlSit'], ['cat', 'Catégorie', 'text', 'dlCat'],
  ['enfants', "Nb d'enfants", 'number'], ['banque', 'Banque', 'text', 'dlBanque'],
  ['quartier', 'Quartier', 'text', 'dlQuartier'], ['nbanc', 'N° Bancaire'],
  ['genre', 'Genre', 'genre'], ['nss', 'N° Sécurité Sociale'],
  ['tel', 'Téléphone']
];
var brouillonForm = {};
function champ(c, val, prefix) {
  var id = (prefix || 'f_') + c[0], t = c[2] || 'text', h;
  if (t === 'genre') h = '<select id="' + id + '"><option value=""></option><option' + (val === 'H' ? ' selected' : '') + '>H</option><option' + (val === 'F' ? ' selected' : '') + '>F</option></select>';
  else if (c[3] && listeDe(c[3])) {
    var opts = (S.P.listes[listeDe(c[3])] || []).slice(); if (val && opts.indexOf(val) < 0) opts.push(val);
    h = '<select id="' + id + '"><option value=""></option>' + opts.map(function (o) { return '<option' + (o === val ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select>';
  }
  else h = '<input id="' + id + '" type="' + t + '"' + (t === 'number' ? ' step="any" inputmode="decimal"' : '') + (c[3] ? ' list="' + c[3] + '"' : '') + ' value="' + esc(val) + '">';
  return '<div class="field"><label for="' + id + '">' + esc(c[1]) + '</label>' + h + '</div>';
}
function listesSaisie() {
  return datalist('dlContrat', 'contrat', ['CDI', 'CDD', 'STAGE']) + datalist('dlPoste', 'poste') + datalist('dlDept', 'dept') +
    datalist('dlSit', 'situation', ['Marié(e)', 'Célibataire', 'Divorcé(e)', 'Veuf(ve)']) + datalist('dlCat', 'cat', ['A', 'B', 'C']) +
    datalist('dlBanque', 'banque') + datalist('dlQuartier', 'quartier');
}
function pFormulaire(m) {
  var prochain = RH.prochainMatricule(S.emps.map(function (e) { return e.mat; }));
  m.innerHTML = top('Personnel', 'Formulaire', '<a class="btn" href="#personnels">' + ic('users') + 'Voir le tableau Personnels</a>') +
    '<div class="panel" style="max-width:1000px"><div class="panel-h"><h2>Nouveau salarié</h2><span style="color:var(--muted);font-size:11.5px">Le matricule est attribué automatiquement</span></div>' +
    '<form class="panel-b" id="fForm"><div class="grid g3">' + ['mat', 'prenom', 'nom', 'naissance', 'genre', 'situation', 'enfants', 'quartier', 'tel', 'entree', 'contrat', 'poste', 'dept', 'cat', 'base', 'banque', 'nbanc', 'nss'].map(function (k) { return k === 'base' ? ['base', 'Salaire de base (F CFA)', 'number'] : CHAMPS_FORM.filter(function (c) { return c[0] === k; })[0]; }).map(function (c) { return champ(c, brouillonForm[c[0]] || ''); }).join('') + '</div>' + listesSaisie() +
    '<div class="inline" style="margin-top:12px;justify-content:flex-end"><button class="btn" type="button" id="fClear">Effacer</button><button class="btn pri" type="submit">' + ic('plus') + 'Enregistrer</button></div></form></div>';
  $('#f_mat').value = prochain; $('#f_mat').readOnly = true; $('#f_mat').tabIndex = -1; $('#f_mat').style.background = '#eceef1'; $('#f_mat').title = 'Attribué automatiquement';
  $('#fForm').addEventListener('input', function () { CHAMPS_FORM.forEach(function (c) { brouillonForm[c[0]] = $('#f_' + c[0]).value; }); brouillonForm.base = $('#f_base').value; });
  $('#fForm').addEventListener('change', function () { CHAMPS_FORM.forEach(function (c) { brouillonForm[c[0]] = $('#f_' + c[0]).value; }); brouillonForm.base = $('#f_base').value; });
  $('#fClear').onclick = function () { brouillonForm = {}; pFormulaire(m); };
  $('#fForm').onsubmit = function (ev) {
    ev.preventDefault();
    var e = {};
    CHAMPS_FORM.forEach(function (c) { var v = $('#f_' + c[0]).value.trim(); e[c[0]] = c[2] === 'number' ? (v === '' ? '' : Number(v)) : v; });
    e.mat = RH.prochainMatricule(S.emps.map(function (x) { return x.mat; }));
    e.base = numOuVide($('#f_base').value);
    if (e.nom === '' && e.prenom === '') { alerte('Formulaire', 'Saisissez au moins le nom et le prénom du salarié.', 'warn'); return; }
    if (findEmp(e.mat)) { alerte('Formulaire', 'Le matricule ' + e.mat + ' existe déjà dans le tableau Personnels.\nChoisissez un autre matricule (prochain disponible : ' + prochain + ').', 'warn'); return; }
    S.emps.push(e);
    S.emps.sort(function (a, b) { return String(a.mat).localeCompare(String(b.mat), 'fr', { numeric: true }); });
    save(); brouillonForm = {};
    toast(e.mat + ' ' + nomComplet(e) + ' ajouté au tableau Personnels');
    pFormulaire(m); $('#f_prenom').focus();
  };
}

// ======================================================================
//  PERSONNELS (Tableau1)
// ======================================================================
var COLS = [ // toutes les colonnes de Tableau1, dans l'ordre du classeur
  ['N° Matricule', 'e', 'mat'], ['Prénom', 'e', 'prenom'], ['Nom', 'e', 'nom'], ['Date de Naissance', 'e', 'naissance', 'd'],
  ['Situation matrimoniale', 'e', 'situation'], ['Nb enfants', 'e', 'enfants', 'n'], ['Quartier', 'e', 'quartier'], ["Date d'entrée", 'e', 'entree', 'd'],
  ['Genre', 'e', 'genre'], ['N° de Téléphone', 'e', 'tel'], ['Nature du contrat', 'e', 'contrat'], ['Poste', 'e', 'poste'], ['Département', 'e', 'dept'],
  ['Catégorie', 'e', 'cat'], ['Banque', 'e', 'banque'], ['N° Bancaire', 'e', 'nbanc'], ['N° de Sécurité Sociale', 'e', 'nss'],
  ['Ancienneté (ans)', 'r', 'anc', 'n'], ['Taux ancienneté', 'r', 'tauxAnc', 'p'], ['Salaire de Base', 'e', 'base', 'm'],
  ['Indemnité Spéciale de 1973', 'r', 'isp73', 'm'], ['Indemnité de cherté de vie 1974', 'r', 'icv74', 'm'], ['Indemnité de solidarité 1991', 'r', 'isol91', 'm'],
  ["Prime d'ancienneté", 'r', 'panc', 'm'], ['Indemnité de Transport', 'e', 'transport', 'm'], ['Indemnité de Caisse', 'e', 'caisse', 'm'],
  ['Indemnité de Monture', 'e', 'monture', 'm'], ['Indemnité de responsabilité', 'e', 'resp', 'm'], ['Avantage en Nature', 'e', 'avn', 'm'],
  ['Heures Sup 10%', 'e', 'hs10', 'm'], ['Heures Sup 25%', 'e', 'hs25', 'm'], ['Heures Sup 50%', 'e', 'hs50', 'm'], ['Heures Sup 100%', 'e', 'hs100', 'm'],
  ['Sursalaire', 'e', 'sursal', 'm'], ['Salaire Brut', 'r', 'brut', 'm'], ['Base Cotisable', 'r', 'baseCot', 'm'], ['INPS', 'r', 'inps', 'm'], ['AMO', 'r', 'amo', 'm'],
  ['ITS (montant à saisir)', 'e', 'its', 'm'], ['INPS2', 'r', 'inps2', 'm'], ['AMO2', 'r', 'amo2', 'm'], ['CF', 'r', 'cf', 'm'], ['TL', 'r', 'tl', 'm'],
  ['Salaire de B 10%', 'r', 'b10', 'm'], ['Indem T S', 'r', 'itsT', 'm'], ['Indem CS', 'r', 'itsC', 'm'], ['Indem MS', 'r', 'itsM', 'm'], ['Respons S', 'r', 'respS', 'm'],
  ['AVN S', 'r', 'avnS', 'm'], ['Base imposable', 'r', 'baseImp', 'm'], ['Base CF TL', 'r', 'baseCFTL', 'm'], ['Âge', 'r', 'age', 'n'],
  ['Date de Sortie', 'e', 'sortie', 'd'], ['Fin de contrat', 'e', 'fin', 'd'], ['Statut', 'r', 'statut'], ['Tranche S', 'r', 'trancheS', 'm'],
  ['Tranche Salaire', 'r', 'trancheSal'], ['Tranche Âge', 'r', 'trancheAge'], ['Masse Salariale', 'r', 'masse', 'm'], ['Net négocié', 'e', 'netNeg', 'm']
];
function cell(x, c) {
  var v = x[c[1]][c[2]];
  if (c[3] === 'd') return fd(v);
  if (c[3] === 'p') return v === false ? 'FAUX' : fp(v);
  if (c[3] === 'm') return fm(v === '000' ? 0 : v);
  if (c[3] === 'n') return fm(v);
  return esc(v);
}
var recherche = '', selection = {};
// Colonnes « Personnels » : identité et contrat seulement (la paie est dans Éléments de salaire)
var COLS_PERS = ['mat', 'prenom', 'nom', 'naissance', 'situation', 'enfants', 'quartier', 'entree', 'genre', 'tel', 'contrat', 'poste', 'dept', 'cat', 'banque', 'nbanc', 'nss', 'anc', 'age', 'sortie', 'fin', 'statut']
  .map(function (k) { return COLS.filter(function (c) { return c[2] === k; })[0]; });
function pPersonnels(m) {
  m.innerHTML = top('Personnel', 'Personnels',
    '<a class="btn" href="#elements">' + ic('coins') + 'Éléments de salaire</a>' +
    '<button class="btn" id="bCsv" type="button">' + ic('dl') + 'Exporter (Excel/CSV)</button>' +
    '<a class="btn pri" href="#formulaire">' + ic('plus') + 'Nouveau salarié</a>') +
    '<div class="panel"><div class="panel-h" style="flex-wrap:wrap"><div class="inline" style="flex:1;min-width:240px"><div class="field" style="flex:1;max-width:400px"><input id="q" type="search" placeholder="Rechercher : nom, prénom, département, CDI/CDD/STAGE, H ou F" value="' + esc(recherche) + '" aria-label="Rechercher"></div><span id="qCount" style="color:var(--muted);font-size:12px"></span></div>' +
    '<div class="inline"><div class="seg"><button type="button" data-v="resume" class="' + (S.ui.vue !== 'complet' ? 'on' : '') + '">Vue résumée</button><button type="button" data-v="complet" class="' + (S.ui.vue === 'complet' ? 'on' : '') + '">Toutes les informations</button></div>' +
    '<button class="btn dan sm" id="bDel" type="button" disabled>' + ic('trash') + 'Supprimer la sélection</button></div></div>' +
    '<div class="tbl-wrap" style="max-height:calc(100vh - 150px)" id="tWrap"></div></div>';
  $('#q').oninput = function () { recherche = this.value; tablePers(); };
  $$('.seg button', m).forEach(function (b) { b.onclick = function () { S.ui.vue = b.dataset.v; save(); pPersonnels(m); }; });
  $('#bDel').onclick = supprimerSelection;
  $('#bCsv').onclick = exporterCSV;
  tablePers();
}
function tablePers() {
  var R = rows(), vis = R.filter(function (x) { return RH.correspond(x.e, recherche); });
  var nbTot = R.filter(function (x) { return !blank(x.e.mat); }).length;
  var crit = recherche.trim();
  $('#qCount').textContent = crit === '' ? nbTot + ' salariés au total' : vis.length === 0 ? 'Aucun salarié trouvé' : vis.length + ' salarié' + (vis.length > 1 ? 's trouvés' : ' trouvé') + ' sur ' + nbTot;
  var h;
  function tr(x, inner) { return '<tr data-mat="' + esc(x.e.mat) + '" class="' + (selection[x.e.mat] ? 'sel ' : '') + (x.r.statut !== 'Actif' ? 'out' : '') + '"><td><input type="checkbox" class="selr" ' + (selection[x.e.mat] ? 'checked' : '') + ' aria-label="Sélectionner"></td>' + inner + '</tr>'; }
  if (S.ui.vue === 'complet') {
    h = '<table class="tbl"><thead><tr><th><input type="checkbox" id="selAll" aria-label="Tout sélectionner"></th>' + COLS_PERS.map(function (c) { return '<th' + (c[3] === 'n' ? ' class="num"' : '') + '>' + esc(c[0]) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      vis.map(function (x) { return tr(x, COLS_PERS.map(function (c) { return '<td class="' + (c[3] === 'n' ? 'num' : '') + (c[1] === 'r' ? ' k' : '') + '">' + (c[2] === 'statut' ? statutPill(x.r.statut) : cell(x, c)) + '</td>'; }).join('')); }).join('') + '</tbody></table>';
  } else {
    h = '<table class="tbl"><thead><tr><th><input type="checkbox" id="selAll" aria-label="Tout sélectionner"></th><th>Matricule</th><th>Salarié</th><th>Genre</th><th>Contrat</th><th>Département</th><th>Cat.</th><th>Téléphone</th><th>Date d\'entrée</th><th class="num">Ancienneté</th><th>Fin de contrat</th><th>Statut</th></tr></thead><tbody>' +
      vis.map(function (x) {
        return tr(x, '<td class="mono">' + esc(x.e.mat) + '</td><td class="who"><b>' + esc(nomComplet(x.e)) + '</b><span>' + esc(x.e.poste) + '</span></td><td>' + esc(x.e.genre) + '</td><td>' + contratPill(x.e.contrat) + '</td><td>' + esc(x.e.dept) + '</td><td>' + esc(x.e.cat) + '</td><td>' + esc(x.e.tel) + '</td><td>' + fd(x.e.entree) + '</td>' +
          '<td class="num">' + fm(x.r.anc) + ' an' + (N(x.r.anc) > 1 ? 's' : '') + '</td><td>' + fd(x.e.fin) + '</td><td>' + statutPill(x.r.statut) + (x.e.sortie ? ' <span style="font-size:11px;color:var(--muted)">' + fd(x.e.sortie) + '</span>' : '') + '</td>');
      }).join('') + '</tbody></table>';
  }
  if (!vis.length) h += '<div class="panel-b" style="color:var(--muted)">' + (S.emps.length ? 'Aucun salarié ne correspond à la recherche.' : 'Aucun salarié. Saisissez le premier dans le Formulaire.') + '</div>';
  $('#tWrap').innerHTML = h;
  $$('#tWrap tbody tr').forEach(function (trEl) {
    trEl.addEventListener('click', function (ev) {
      var mat = trEl.dataset.mat;
      if (ev.target.classList.contains('selr')) { selection[mat] = ev.target.checked; trEl.classList.toggle('sel', ev.target.checked); majDel(); return; }
      ouvrirFiche(mat);
    });
  });
  var sa = $('#selAll'); if (sa) sa.onclick = function () { vis.forEach(function (x) { selection[x.e.mat] = sa.checked; }); tablePers(); };
  majDel();
}
function majDel() { var n = Object.keys(selection).filter(function (k) { return selection[k] && findEmp(k); }).length; var b = $('#bDel'); if (b) { b.disabled = !n; b.lastChild.textContent = n ? 'Supprimer la sélection (' + n + ')' : 'Supprimer la sélection'; } }
function supprimerSelection() {
  var mats = Object.keys(selection).filter(function (k) { return selection[k] && findEmp(k); });
  if (!mats.length) return;
  var liste = mats.map(function (k) { var e = findEmp(k); return '<li><span class="mono">' + esc(k) + '</span> ' + esc(nomComplet(e)) + '</li>'; }).join('');
  confirmer('Supprimer des salariés', '<p style="margin:0">Voulez-vous vraiment supprimer ' + mats.length + ' salarié(s) ?</p><ul style="margin:0">' + liste + '</ul>' +
    '<div class="note warn">Cette suppression est définitive. Astuce : pour garder l\'historique et le turnover, saisissez plutôt une date de sortie.</div>', 'Supprimer', function () {
      S.emps = S.emps.filter(function (e) { return mats.indexOf(String(e.mat)) < 0; });
      selection = {}; save(); toast(mats.length + ' salarié(s) supprimé(s).'); route();
    }, 'dan');
}

// Fiche salarié (édition d'une ligne de Tableau1)
// Fiche salarié : identité et contrat (la paie se saisit dans Éléments de salaire)
var CHAMPS_DATES = [['fin', 'Fin de contrat', 'date'], ['sortie', 'Date de sortie', 'date']];
function ouvrirFiche(mat) {
  var e0 = findEmp(mat); if (!e0) return;
  var d = JSON.parse(JSON.stringify(e0));
  var v = document.createElement('div'); v.className = 'veil';
  var ordre = ['mat', 'prenom', 'nom', 'naissance', 'genre', 'situation', 'enfants', 'quartier', 'tel', 'entree', 'contrat', 'poste', 'dept', 'cat', 'banque', 'nbanc', 'nss'];
  var idChamps = ordre.map(function (k) { return CHAMPS_FORM.filter(function (c) { return c[0] === k; })[0]; });
  v.innerHTML = '<div class="drawer" role="dialog" aria-modal="true" style="width:min(760px,100%)"><div class="drawer-h"><div><div style="font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:var(--muted);font-weight:700">Fiche salarié · <span class="mono">' + esc(d.mat) + '</span></div><h2 style="font-size:17px;color:var(--navy)" id="dTitle">' + esc(nomComplet(d)) + '</h2></div>' +
    '<div class="inline"><button class="btn sm" type="button" id="dEl">' + ic('coins') + 'Éléments de salaire</button><button class="btn sm" type="button" id="dBul">' + ic('slip') + 'Bulletin</button><button class="btn sm" type="button" id="dClose">Fermer</button></div></div>' +
    '<div class="drawer-b"><div><div class="tabs">' + ['État civil', 'Contrat', 'Banque et sécurité sociale', 'Paie'].map(function (t, i) { return '<button type="button" class="tab' + (i === 0 ? ' on' : '') + '" data-tab="' + i + '">' + t + '</button>'; }).join('') + '</div>' +
    '<div class="tabpane grid g3" data-pane="0">' + idChamps.slice(0, 9).map(function (c) { return champ(c, d[c[0]], 'd_'); }).join('') + '</div>' +
    '<div class="tabpane grid g3" data-pane="1" hidden>' + idChamps.slice(9, 14).map(function (c) { return champ(c, d[c[0]], 'd_'); }).join('') + CHAMPS_DATES.map(function (c) { return champ(c, d[c[0]], 'd_'); }).join('') + '</div>' +
    '<div class="tabpane grid g3" data-pane="2" hidden>' + idChamps.slice(14).map(function (c) { return champ(c, d[c[0]], 'd_'); }).join('') + '</div>' +
    '<div class="tabpane" data-pane="3" hidden><div class="grid g3" id="dCalc"></div><div style="margin-top:8px;font-size:11.5px;color:var(--muted)">Les éléments de salaire se saisissent dans le menu Éléments de salaire.</div></div>' + listesSaisie() + '</div>' +
    '</div><div class="drawer-f"><button class="btn dan" type="button" id="dDel">' + ic('trash') + 'Supprimer</button><div class="inline"><button class="btn" type="button" id="dCancel">Annuler</button><button class="btn pri" type="button" id="dSave">Enregistrer</button></div></div></div>';
  document.body.appendChild(v);
  function lire() { CHAMPS_FORM.concat(CHAMPS_DATES).forEach(function (c) { d[c[0]] = c[2] === 'number' ? numOuVide($('#d_' + c[0], v).value) : $('#d_' + c[0], v).value.trim(); }); }
  function maj() {
    lire();
    var r = RH.calcLigne(d, S.P, today()), b = RH.bulletin(d, r, S.P, S.ret[d.mat]);
    var L = [['Ancienneté', fm(r.anc) + ' an(s) · taux ' + (r.tauxAnc === false ? 'FAUX' : fp(r.tauxAnc))], ['Âge', fm(r.age) + ' ans'], ['Statut', statutPill(r.statut)],
      ['Salaire de base', fm(d.base)], ['Salaire brut', '<b>' + fm(r.brut) + '</b>'], ['Net à payer', '<b>' + fm(b.net) + '</b>']];
    $('#dCalc', v).innerHTML = L.map(function (l) { return '<div class="field calc"><label>' + l[0] + '</label><output>' + l[1] + '</output></div>'; }).join('');
    $('#dTitle', v).textContent = nomComplet(d);
  }
  $$('.tab', v).forEach(function (t) { t.onclick = function () { $$('.tab', v).forEach(function (x) { x.classList.toggle('on', x === t); }); $$('.tabpane', v).forEach(function (p) { p.hidden = p.dataset.pane !== t.dataset.tab; }); }; });
  var fm_ = $('#d_mat', v); fm_.readOnly = true; fm_.style.background = '#eceef1'; fm_.title = 'Le matricule ne se modifie pas';
  v.addEventListener('input', maj);
  maj();
  function fermer() { v.remove(); }
  $('#dClose', v).onclick = fermer; $('#dCancel', v).onclick = fermer;
  v.addEventListener('mousedown', function (ev) { if (ev.target === v) fermer(); });
  $('#dSave', v).onclick = function () {
    lire();
    if (d.mat === '') { alerte('Fiche salarié', 'Le N° de matricule est obligatoire.', 'warn'); return; }
    if (String(d.mat) !== String(e0.mat) && findEmp(d.mat)) { alerte('Fiche salarié', 'Le matricule ' + d.mat + ' existe déjà.', 'warn'); return; }
    var i = S.emps.indexOf(e0); S.emps[i] = d;
    S.emps.sort(function (a, b) { return String(a.mat).localeCompare(String(b.mat), 'fr', { numeric: true }); });
    save(); fermer(); toast('Fiche enregistrée'); route();
  };
  $('#dDel', v).onclick = function () { selection = {}; selection[e0.mat] = true; fermer(); supprimerSelection(); };
  $('#dBul', v).onclick = function () { S.ui.bulMat = e0.mat; save(); fermer(); location.hash = '#bulletin'; };
  $('#dEl', v).onclick = function () { S.ui.elMat = e0.mat; save(); fermer(); location.hash = '#elements'; };
}

// ======================================================================
//  ÉLÉMENTS DE SALAIRE (saisie liée au tableau Personnels)
// ======================================================================
var EL_SAISIE = [['base', 'Salaire de base'], ['transport', 'Ind. transport'], ['caisse', 'Ind. caisse'], ['monture', 'Ind. monture'], ['resp', 'Ind. responsabilité'], ['avn', 'Avantage nature'],
  ['hs10', 'HS 10%'], ['hs25', 'HS 25%'], ['hs50', 'HS 50%'], ['hs100', 'HS 100%'], ['sursal', 'Sursalaire']];
var EL_CALC = [['anc', 'Ancienneté', 'n'], ['tauxAnc', 'Taux anc.', 'p'], ['isp73', 'Ind. spéciale 1973', 'm'], ['icv74', 'Cherté de vie 1974', 'm'], ['isol91', 'Solidarité 1991', 'm'], ['panc', "Prime d'ancienneté", 'm'],
  ['brut', 'Salaire brut', 'm', 1], ['baseCot', 'Base cotisable', 'm'], ['inps', 'INPS', 'm', 1], ['amo', 'AMO', 'm', 1], ['inps2', 'INPS patronal', 'm', 1], ['amo2', 'AMO patronal', 'm', 1],
  ['cf', 'CF', 'm', 1], ['tl', 'TL', 'm', 1], ['baseImp', 'Base imposable', 'm'], ['baseCFTL', 'Base CF TL', 'm'], ['masse', 'Masse salariale', 'm', 1]];
var EL_MASQUE = [['b10', 'Salaire de base 10%', 'm'], ['itsT', 'Indem T S', 'm'], ['itsC', 'Indem C S', 'm'], ['itsM', 'Indem M S', 'm'], ['respS', 'Respons S', 'm'], ['avnS', 'AVN S', 'm'],
  ['trancheS', 'Tranche S', 'm'], ['trancheSal', 'Tranche salaire', 't'], ['trancheAge', 'Tranche âge', 't']];
var rechEl = '';
// Net négocié : le sursalaire est recalculé automatiquement (même méthode que le bouton « Calcul à l'envers »)
function netNegocieAuto(e, k, v) {
  if (k === 'netNeg') {
    if (N(v) <= 0) return false;
    var res = RH.chercherSursalaire(e, S.P, S.ret[e.mat], today(), N(v));
    if (!res.ok) { alerte('Net négocié', 'Même sans sursalaire, le net de ' + nomComplet(e) + ' dépasse déjà ' + fm(N(v)) + ' F CFA.\nNet sans sursalaire : ' + fm(res.net) + ' F CFA.\n\nLe calcul ne peut que rajouter du sursalaire, il ne baisse pas le salaire de base.', 'warn'); return true; }
    e.sursal = res.sursalaire === 0 ? '' : res.sursalaire; save();
    toast('Sursalaire calculé : ' + fm(res.sursalaire) + ' F — net obtenu ' + fm(res.net) + ' F');
    return true;
  }
  if (N(e.netNeg) <= 0 || /^hs/.test(k) || k === 'its') return false;
  if (k === 'sursal') { e.netNeg = ''; save(); toast('Sursalaire saisi à la main : le net négocié est retiré'); return true; }
  var res2 = RH.chercherSursalaire(e, S.P, S.ret[e.mat], today(), N(e.netNeg));
  if (res2.ok) { e.sursal = res2.sursalaire === 0 ? '' : res2.sursalaire; save(); toast('Sursalaire ajusté pour garder le net négocié de ' + fm(e.netNeg) + ' F'); }
  else toast('Net négocié dépassé même sans sursalaire : vérifiez la ligne de ' + nomComplet(e));
  return true;
}
function rubriquesActives() { return (S.P.rubriques || []).filter(function (r) { return r.actif !== false; }); }
function colsSaisieToutes() { return EL_SAISIE.concat(rubriquesActives().filter(function (r) { return r.mode === 'saisi'; }).map(function (r) { return ['rub:' + r.code, r.lib + (r.type === 'retenue' ? ' (retenue)' : ''), r]; })); }
function colsSaisie() {
  var c = colsSaisieToutes(); if (S.ui.elToutes) return c;
  return c.filter(function (x) { return x[0] === 'base' || x[0].indexOf('rub:') === 0 || S.emps.some(function (e) { return !blank(getK(e, x[0])) && N(getK(e, x[0])) !== 0; }); });
}
function getK(e, k) { if (k.indexOf('rub:') === 0) return e.rub ? e.rub[k.slice(4)] : ''; return e[k]; }
function setK(e, k, v) { if (k.indexOf('rub:') === 0) { e.rub = e.rub || {}; if (v === '') delete e.rub[k.slice(4)]; else e.rub[k.slice(4)] = v; } else e[k] = v; }
function fCalc(v, t) { if (t === 'p') return v === false ? 'FAUX' : fp(v); if (t === 't') return esc(v); return fm(v === '000' ? 0 : v === false ? 0 : v); }
function pElements(m) {
  var vue = S.ui.elVue || 'saisie';
  m.innerHTML = top('Paie', 'Éléments de salaire',
    '<button class="btn" id="eRecalc" type="button">Recalculer les nets négociés</button><a class="btn" href="#heures">' + ic('clock') + 'Heures sup</a><a class="btn nav-b" href="#bulletin">' + ic('slip') + 'Bulletins</a>') +
    '<div class="panel" style="margin-bottom:10px"><div class="panel-b bar">' +
    '<div class="field"><label for="pDeb">Période de paie : début</label><input type="date" id="pDeb" value="' + esc(S.periode.debut) + '"></div>' +
    '<div class="field"><label for="pFin">Fin</label><input type="date" id="pFin" value="' + esc(S.periode.fin) + '"></div>' +
    '<div class="field" style="flex:1;min-width:200px;max-width:320px"><label for="qe">Rechercher</label><input id="qe" type="search" placeholder="Nom, département, CDI, H ou F…" value="' + esc(rechEl) + '"></div>' +
    '<div class="field"><label>Affichage</label><div class="seg" id="eVue"><button type="button" data-v="saisie" class="' + (vue === 'saisie' ? 'on' : '') + '">Saisie des éléments</button><button type="button" data-v="calc" class="' + (vue === 'calc' ? 'on' : '') + '">Éléments calculés</button></div></div>' +
    '<label class="inline" style="font-size:11.5px;color:var(--muted);font-weight:700;padding-bottom:6px"><input type="checkbox" id="eToutes"' + (S.ui.elToutes ? ' checked' : '') + '> Afficher les éléments non renseignés</label>' +
    (vue === 'calc' ? '<label class="inline" style="font-size:11.5px;color:var(--muted);font-weight:700;padding-bottom:6px"><input type="checkbox" id="eMasq"' + (S.ui.elMasq ? ' checked' : '') + '> Afficher les bases de calcul masquées</label>' : '') +
    '</div><div class="panel-b" style="padding-top:0"><div class="mini" id="eTot"></div></div></div>' +
    '<div class="panel"><div class="tbl-wrap" style="max-height:calc(100vh - 230px)" id="eWrap"></div></div>';
  $('#pDeb').onchange = function () { S.periode.debut = this.value; save(); };
  $('#pFin').onchange = function () { S.periode.fin = this.value; save(); };
  $('#qe').oninput = function () { rechEl = this.value; tableEl(); };
  $$('#eVue button').forEach(function (b) { b.onclick = function () { S.ui.elVue = b.dataset.v; save(); pElements(m); }; });
  if ($('#eMasq')) $('#eMasq').onchange = function () { S.ui.elMasq = this.checked; save(); tableEl(); };
  $('#eToutes').onchange = function () { S.ui.elToutes = this.checked; save(); tableEl(); };
  $('#eRecalc').onclick = recalculerNets;
  tableEl();
  if (S.ui.elMat) { var tr = $('#eWrap tr[data-mat="' + S.ui.elMat + '"]'); if (tr) { tr.classList.add('hl'); tr.scrollIntoView({ block: 'center' }); var f = $('input', tr); if (f) f.focus(); } S.ui.elMat = ''; }
}
function totauxEl() {
  var R = rows(), t = { inps: 0, amo: 0, its: 0, inps2: 0, amo2: 0, cf: 0, tl: 0, brut: 0, masse: 0 };
  R.forEach(function (x) { t.inps += N(x.r.inps); t.amo += N(x.r.amo); t.its += N(x.e.its); t.inps2 += N(x.r.inps2); t.amo2 += N(x.r.amo2); t.cf += N(x.r.cf); t.tl += N(x.r.tl); });
  $('#eTot').innerHTML = '<span>CA de la structure <b>' + fm(S.P.ca) + '</b></span><span>Part salariale : INPS <b>' + fm(t.inps) + '</b> · AMO <b>' + fm(t.amo) + '</b> · ITS saisi <b>' + fm(t.its) + '</b></span>' +
    '<span>Part patronale : INPS <b>' + fm(t.inps2) + '</b> · AMO <b>' + fm(t.amo2) + '</b> · CF <b>' + fm(t.cf) + '</b> · TL <b>' + fm(t.tl) + '</b></span>';
}
function footSaisie(vis) {
  vis = vis.map(function (x) { return { e: x.e, r: RH.calcLigne(x.e, S.P, today()) }; });
  function somme(fn) { return vis.reduce(function (s, x) { return s + N(fn(x)); }, 0); }
  return '<tr><td colspan="2" class="stk s1">Totaux (' + vis.length + ')</td>' +
    '<td class="num">' + fm(somme(function (x) { return x.r.brut; })) + '</td><td class="num">' + fm(somme(function (x) { var b = RH.bulletin(x.e, x.r, S.P, S.ret[x.e.mat]); return b.erreur ? 0 : b.net; })) + '</td>' +
    colsSaisie().map(function (c) { return '<td class="num">' + fm(somme(function (x) { return getK(x.e, c[0]); })) + '</td>'; }).join('') +
    '<td class="num">' + fm(somme(function (x) { return x.e.its; })) + '</td><td></td></tr>';
}
function tableEl() {
  var vue = S.ui.elVue || 'saisie', R = rows(), vis = R.filter(function (x) { return RH.correspond(x.e, rechEl); }), h;
  function who(x) { return '<td class="mono stk s1">' + esc(x.e.mat) + '</td><td class="stk s2"><b>' + esc(nomComplet(x.e)) + '</b>' + (x.r.statut !== 'Actif' ? ' <span class="pill sortie">sorti</span>' : '') + '</td>'; }
  function somme(fn) { return vis.reduce(function (s, x) { return s + N(fn(x)); }, 0); }
  if (vue === 'saisie') {
    h = '<table class="tbl el"><thead><tr><th colspan="2" class="stk s1"></th><th colspan="2" class="grpH grp-calc">Résultat</th><th colspan="' + colsSaisie().length + '" class="grpH grp-in">Éléments saisis (F CFA)</th><th colspan="2" class="grpH grp-in">Autres saisies</th></tr>' +
      '<tr><th class="stk s1">Matricule</th><th class="stk s2">Salarié</th><th class="num">Salaire brut</th><th class="num">Net à payer</th>' + colsSaisie().map(function (c) { return '<th class="num' + (c[2] ? ' grp-in' : '') + '">' + esc(c[1]) + '</th>'; }).join('') + '<th class="num">ITS (montant saisi)</th><th class="num">Net négocié</th></tr></thead><tbody>' +
      vis.map(function (x) {
        var b = RH.bulletin(x.e, x.r, S.P, S.ret[x.e.mat]), bloque = N(x.e.resp) !== 0;
        return '<tr data-mat="' + esc(x.e.mat) + '" class="' + (x.r.statut !== 'Actif' ? 'out' : '') + '" style="cursor:default">' + who(x) +
          '<td class="num" data-o="brut"><b>' + fm(x.r.brut) + '</b></td><td class="num" data-o="net"><b>' + fm(b.net) + '</b></td>' +
          colsSaisie().map(function (c) { var dis = bloque && /^hs/.test(c[0]) && blank(x.e[c[0]]); return '<td class="ed"><input class="cellin" data-k="' + c[0] + '" inputmode="decimal" value="' + fm(getK(x.e, c[0])) + '"' + (dis ? ' disabled title="Indemnité de responsabilité : pas d\'heures supplémentaires"' : '') + ' aria-label="' + c[1] + '"></td>'; }).join('') +
          '<td class="ed"><input class="cellin" data-k="its" inputmode="decimal" value="' + fm(x.e.its) + '" aria-label="ITS saisi"></td>' +
          '<td class="ed"><span class="inline" style="flex-wrap:nowrap;gap:4px"><input class="cellin" data-k="netNeg" inputmode="decimal" value="' + fm(x.e.netNeg) + '" aria-label="Net négocié"><button class="iconbtn" type="button" data-env="' + esc(x.e.mat) + '" title="Calcul à l\'envers">⇄</button></span></td></tr>';
      }).join('') + '</tbody><tfoot>' + footSaisie(vis) + '</tfoot></table>';
  } else {
    var cols = EL_CALC.concat(S.ui.elMasq ? EL_MASQUE : []), ib = 6;
    cols = cols.slice(0, ib).concat(rubriquesActives().map(function (r) { return ['rub:' + r.code, r.lib + (r.type === 'retenue' ? ' (retenue)' : ''), 'm', 1, r]; }), cols.slice(ib));
    if (!S.ui.elToutes) cols = cols.filter(function (c) { return c[2] === 't' || c[0] === 'brut' || R.some(function (x) { var v = valR(x, c); return v !== '' && v !== '000' && v !== false && N(v) !== 0; }); });
    function valR(x, c) { if (c[0].indexOf('rub:') !== 0) return x.r[c[0]]; var code = c[0].slice(4), l = (x.r.rubGains || []).concat(x.r.rubRet || []).filter(function (g) { return g.code === code; })[0]; return l ? l.v : ''; }
    h = '<table class="tbl el"><thead><tr><th class="stk s1">Matricule</th><th class="stk s2">Salarié</th>' + cols.map(function (c) { return '<th class="num' + (EL_MASQUE.indexOf(c) >= 0 || c[4] ? ' grp-in' : '') + '">' + esc(c[1]) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      vis.map(function (x) { return '<tr data-mat="' + esc(x.e.mat) + '" class="' + (x.r.statut !== 'Actif' ? 'out' : '') + '" style="cursor:default">' + who(x) + cols.map(function (c) { return '<td class="num">' + fCalc(valR(x, c), c[2]) + '</td>'; }).join('') + '</tr>'; }).join('') +
      '</tbody><tfoot><tr><td colspan="2" class="stk s1">Totaux (' + vis.length + ')</td>' + cols.map(function (c) { return '<td class="num">' + (c[3] ? fm(somme(function (x) { return valR(x, c); })) : '') + '</td>'; }).join('') + '</tr></tfoot></table>';
  }
  if (!vis.length) h += '<div class="panel-b" style="color:var(--muted)">' + (S.emps.length ? 'Aucun salarié ne correspond à la recherche.' : 'Aucun salarié. Saisissez le premier dans le Formulaire.') + '</div>';
  $('#eWrap').innerHTML = h;
  totauxEl();
  $$('#eWrap .cellin').forEach(function (inp) {
    inp.addEventListener('focus', function () { var e = findEmp(inp.closest('tr').dataset.mat), v0 = getK(e, inp.dataset.k); inp.value = blank(v0) ? '' : v0; inp.select(); });
    inp.addEventListener('blur', function () { var e = findEmp(inp.closest('tr') && inp.closest('tr').dataset.mat); if (e && numOuVide(inp.value) === getK(e, inp.dataset.k)) inp.value = fm(getK(e, inp.dataset.k)); });
    inp.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); var all = $$('#eWrap .cellin:not(:disabled)'), i = all.indexOf(inp); if (all[i + 1]) all[i + 1].focus(); else inp.blur(); } });
    inp.addEventListener('change', function () {
      var tr = inp.closest('tr'), e = findEmp(tr.dataset.mat), k = inp.dataset.k, v = numOuVide(inp.value);
      if (/^hs/.test(k) && v !== '' && v !== 0 && N(e.resp) !== 0) { inp.value = fm(getK(e, k)); alerte('Heures supplémentaires', "Ce salarié a déjà une indemnité de responsabilité : il n'a pas droit aux heures supplémentaires.", 'warn'); return; }
      setK(e, k, v); save();
      var ajuste = netNegocieAuto(e, k, v);
      if (ajuste) { var act = document.activeElement, ak = act && act.dataset ? act.dataset.k : null, am = act && act.closest && act.closest('tr') ? act.closest('tr').dataset.mat : null, y = $('#eWrap').scrollTop, x0 = $('#eWrap').scrollLeft;
        tableEl(); $('#eWrap').scrollTop = y; $('#eWrap').scrollLeft = x0;
        if (ak && am) { var nf = $('#eWrap tr[data-mat="' + am + '"] .cellin[data-k="' + ak + '"]'); if (nf) nf.focus(); }
        return; }
      var r = RH.calcLigne(e, S.P, today()), b = RH.bulletin(e, r, S.P, S.ret[e.mat]);
      $('[data-o="brut"]', tr).innerHTML = '<b>' + fm(r.brut) + '</b>'; $('[data-o="net"]', tr).innerHTML = '<b>' + fm(b.net) + '</b>';
      var bloque = N(e.resp) !== 0; $$('.cellin', tr).forEach(function (c) { if (/^hs/.test(c.dataset.k)) c.disabled = bloque && blank(e[c.dataset.k]); });
      totauxEl();
      if (document.activeElement !== inp) inp.value = fm(getK(e, k));
      $('#eWrap tfoot').innerHTML = footSaisie(vis);
    });
  });
  $$('#eWrap [data-env]').forEach(function (b) { b.onclick = function () { calculEnvers(findEmp(b.dataset.env)); }; });
}
function numOuVide(s) { s = String(s).trim().replace(/\s/g, '').replace(',', '.'); if (s === '') return ''; var n = Number(s); return isNaN(n) ? '' : n; }

// Calcul à l'envers (module CalculEnvers)
function calculEnvers(e) {
  var r = RH.calcLigne(e, S.P, today());
  dialog({
    titre: "Calcul à l'envers", html: '<p style="margin:0">Salarié : <b class="mono">' + esc(e.mat) + '</b> ' + esc(nomComplet(e)) + '</p>' +
      '<div class="field"><label for="envNet">Net à payer négocié (en F CFA, hors heures sup et hors retenues)</label><input id="envNet" inputmode="numeric" value="' + (N(e.netNeg) > 0 ? esc(e.netNeg) : '') + '"></div><div id="envRes"></div>',
    boutons: [{ t: 'Fermer' }, { t: 'Calculer', cls: 'nav-b', fn: function (v) {
      var rep = $('#envNet', v).value.replace(/[\s .]/g, '');
      if (rep === '' || isNaN(Number(rep))) { $('#envRes', v).innerHTML = '<div class="note warn">Saisissez un montant en chiffres, par exemple 250000.</div>'; return false; }
      var cible = Number(rep), res = RH.chercherSursalaire(e, S.P, S.ret[e.mat], today(), cible);
      if (!res.ok) {
        $('#envRes', v).innerHTML = '<div class="note warn"><pre>Même sans sursalaire, le net de ' + esc(nomComplet(e)) + ' dépasse déjà ' + fm(cible) + ' F CFA.\nNet sans sursalaire : ' + fm(res.net) + ' F CFA.\n\nLe calcul à l\'envers ne peut que rajouter du sursalaire, il ne baisse pas le salaire de base.</pre></div>';
        return false;
      }
      $('#envRes', v).innerHTML = '<div class="calcbox"><table><tr><td>Net négocié</td><td class="num">' + fm(cible) + ' F CFA</td></tr><tr class="hl"><td>Sursalaire nécessaire</td><td class="num">' + fm(res.sursalaire) + ' F CFA</td></tr><tr><td>Salaire brut</td><td class="num">' + fm(res.brut) + ' F CFA</td></tr><tr><td>Net obtenu</td><td class="num">' + fm(res.net) + ' F CFA</td></tr></table></div>' +
        '<div class="inline" style="justify-content:flex-end"><button class="btn pri" type="button" id="envSave">Enregistrer ce sursalaire</button></div>';
      $('#envSave', v).onclick = function () {
        e.sursal = res.sursalaire === 0 ? '' : res.sursalaire; e.netNeg = cible; save(); v.remove(); route();
        alerte("Calcul à l'envers", "C'est enregistré. Le net négocié est gardé dans la colonne « Net négocié ».\nSi le salaire de base, l'ancienneté ou les primes changent, utilisez « Recalculer les nets négociés ».", 'ok');
      };
      return false;
    } }]
  });
}
function recalculerNets() {
  confirmer('Nets négociés', '<p style="margin:0">Recalculer le sursalaire de tous les salariés qui ont un net négocié ?</p>', 'Recalculer', function () {
    var n = 0, liste = '', pb = '', t = today();
    S.emps.forEach(function (e) {
      var cible = N(e.netNeg), r = RH.calcLigne(e, S.P, t);
      if (cible > 0 && !blank(e.mat) && r.statut === 'Actif') {
        var res = RH.chercherSursalaire(e, S.P, S.ret[e.mat], t, cible);
        if (res.ok) { e.sursal = res.sursalaire === 0 ? '' : res.sursalaire; e.netNeg = cible; liste += '  ' + e.mat + ' : sursalaire ' + fm(res.sursalaire) + ', net ' + fm(res.net) + '\n'; n++; }
        else pb += '  ' + e.mat + ' : net sans sursalaire déjà à ' + fm(res.net) + '\n';
      }
    });
    save(); route();
    if (n === 0 && pb === '') alerte('Nets négociés', "Aucun salarié n'a de net négocié.\nUtilisez d'abord le bouton « Calcul à l'envers » sur la ligne du salarié.", 'info');
    else alerte('Nets négociés', n + ' salarié(s) recalculé(s).\n\n' + liste + (pb ? '\nNon modifiés :\n' + pb : ''), 'ok');
  });
}
function exporterCSV() {
  var R = rows();
  function c(v) { v = v === false ? '' : v === null || v === undefined ? '' : v; if (typeof v === 'number') return String(Math.round(v * 100) / 100).replace('.', ','); return '"' + String(v).replace(/"/g, '""') + '"'; }
  var lignes = [COLS.map(function (k) { return c(k[0]); }).join(';')].concat(R.map(function (x) {
    return COLS.map(function (k) { var v = x[k[1]][k[2]]; if (k[3] === 'd') v = fd(v); if (v === '000') v = 0; return c(v); }).join(';');
  }));
  telecharger('Personnels ' + today() + '.csv', '﻿' + lignes.join('\r\n'), 'text/csv;charset=utf-8');
}

// ======================================================================
//  BULLETIN DE PAIE
// ======================================================================
function bulletinHTML(e) {
  // Reproduction de la feuille « Bulletin de Paie » du classeur (zone C3:J58, colonnes C à J)
  var r = RH.calcLigne(e, S.P, today()), b = RH.bulletin(e, r, S.P, S.ret[e.mat]);
  var mode = S.ui.modePaie || 'Virement';
  function n(v) { return v === '' || v === null || v === undefined || v === '000' || N(v) === 0 ? '' : fm(v); }
  function g(v) { return v === RH.DIV0 ? fm(v) : N(v) === 0 ? '-' : fm(v); }
  function t(v) { return v === '' || v === null || v === undefined ? '' : fp(v, (Math.round(N(v) * 10000) % 100) ? 2 : 0).replace(' %', '%'); }
  function vide(k) { var h = ''; for (var i = 0; i < k; i++) h += '<tr class="lg"><td class="vl"></td><td class="vl"></td><td class="vl"></td><td class="vl"></td><td class="vl"></td><td class="vl"></td><td class="vl"></td><td class="vl"></td></tr>'; return h; }
  function ligne(lib, nb, base, tx, gain, ret, txp, retp, cls) {
    return '<tr class="lg' + (cls ? ' ' + cls : '') + '"><td class="vl l">' + lib + '</td><td class="vl r">' + nb + '</td><td class="vl c">' + base + '</td><td class="vl r">' + tx + '</td><td class="vl c">' + gain + '</td><td class="vl r">' + ret + '</td><td class="vl r">' + txp + '</td><td class="vl r">' + retp + '</td></tr>';
  }
  // Les éléments de paie non renseignés (montant nul) sont masqués ; le salaire de base reste toujours affiché
  var lignesVis = b.lignes.filter(function (l, i) { return i === 0 || N(l.gain) !== 0; });
  var L = lignesVis.map(function (l, i) {
    var avecTaux = l.taux !== '' && l.taux !== undefined;
    return ligne(esc(l.lib), avecTaux ? '' : (l.nb === '' ? '' : l.nb), n(l.base), avecTaux ? t(l.taux) : '', g(l.gain), '', '', '');
  }).join('');
  var retRub = b.rubRet.map(function (x) { return ligne(esc(x.lib), '', n(x.base), x.taux !== '' ? t(x.taux) : '', '', fm(x.v), '', ''); }).join('');
  return '<div class="bx"><table>' +
    '<colgroup><col style="width:23%"><col style="width:7%"><col style="width:11%"><col style="width:9%"><col style="width:15%"><col style="width:10%"><col style="width:12%"><col style="width:13%"></colgroup>' +
    // Ligne 3
    '<tr><td colspan="2" class="bleu c b bd">BULLETIN DE PAIE</td><td class="bd l">Période du :</td><td class="bd r">' + fd(S.periode.debut) + '</td><td class="bd c">au</td><td class="bd r">' + fd(S.periode.fin) + '</td><td class="bd l">Mode de paie :</td><td class="bd c">' + esc(mode) + '</td></tr>' +
    // Lignes 4 à 9 : structure + identification
    '<tr><td colspan="2" class="c b">' + esc(S.P.nom) + '</td><td colspan="2" class="bd c">Matricule</td><td class="bd c">Ancienneté</td><td class="bd c">Date d\'entrée</td><td colspan="2" class="bd c">N° de Sécurité Sociale :</td></tr>' +
    '<tr><td colspan="2" class="c b">' + esc(S.P.adresse) + '</td><td colspan="2" class="bd c">' + esc(e.mat) + '</td><td class="bd c">' + fm(r.anc) + '</td><td class="bd c">' + fd(e.entree) + '</td><td colspan="2" class="bd c">' + esc(e.nss) + '</td></tr>' +
    '<tr><td colspan="2" class="c b">' + esc(S.P.email) + '</td><td colspan="2" class="bd c">Catégorie</td><td colspan="2" class="bd c">Poste</td><td colspan="2" class="bd c">Département</td></tr>' +
    '<tr><td colspan="2" class="c b">' + esc(S.P.tel) + '</td><td colspan="2" class="bd c">' + esc(e.cat) + '</td><td colspan="2" class="bd c">' + esc(e.poste) + '</td><td colspan="2" class="bd c">' + esc(e.dept) + '</td></tr>' +
    '<tr><td colspan="2" class="c">' + esc(S.P.mention) + '</td><td colspan="2" class="bd c">Banque</td><td colspan="2" class="bd c">N° Bancaire</td><td class="bd c">Type de Contrat</td><td class="bd c">Horaire</td></tr>' +
    '<tr><td colspan="2"></td><td colspan="2" class="bd c">' + esc(e.banque) + '</td><td colspan="2" class="bd c">' + esc(e.nbanc) + '</td><td class="bd c">' + esc(e.contrat) + '</td><td class="bd c">173,33</td></tr>' +
    // Lignes 10 à 17 : bloc logo + cadre salarié bleu
    '<tr class="id"><td colspan="2" rowspan="4" class="bt"></td><td colspan="2" rowspan="4" class="bt c logo">' + logoHTML(64) + '</td><td class="bleu bt l">Nom :</td><td class="bleu bt c">' + esc(e.nom) + '</td><td class="bleu bt l">Prénom :</td><td class="bleu bt c">' + esc(e.prenom) + '</td></tr>' +
    '<tr class="id"><td class="bleu l">Date de naissance :</td><td class="bleu c">' + fd(e.naissance) + '</td><td class="bleu l">Nb d\'enfants :</td><td class="bleu c">' + fm(e.enfants) + '</td></tr>' +
    '<tr class="id"><td class="bleu l">Genre :</td><td class="bleu c">' + esc(e.genre) + '</td><td class="bleu l">Adresse</td><td class="bleu c">' + esc(e.quartier) + '</td></tr>' +
    '<tr class="id"><td class="bleu l">Situation matrim. :</td><td class="bleu c">' + esc(e.situation) + '</td><td class="bleu l">Téléphone :</td><td class="bleu c">' + esc(e.tel) + '</td></tr>' +
    // Lignes 20-21 : en-têtes
    '<tr><td rowspan="2" class="bd c">Désignation</td><td rowspan="2" class="bd c">Nombre</td><td rowspan="2" class="bd c">Base</td><td colspan="3" class="bd c">Part Salariale</td><td colspan="2" class="bd c">Part patronale</td></tr>' +
    '<tr><td class="bd c">Taux</td><td class="bd c">Gain</td><td class="bd c">Retenue</td><td class="bd c">Taux</td><td class="bd c">Retenue</td></tr>' +
    // Lignes 22 à 36 : gains
    L + vide(Math.max(1, 16 - lignesVis.length)) +
    '<tr class="lg"><td class="vl r">Total Brut</td><td class="vl"></td><td class="vl"></td><td class="vl"></td><td class="vl c tot">' + fm(b.brut) + '</td><td class="vl"></td><td class="vl"></td><td class="vl"></td></tr>' + vide(1) +
    // Lignes 40 à 44 : cotisations et impôt
    ligne('INPS', '', n(b.inps.base), t(b.inps.ts), '', fm(b.inps.rs), t(b.inps.tp), fm(b.inps.rp)) +
    ligne('AMO', '', n(b.amo.base), t(b.amo.ts), '', fm(b.amo.rs), t(b.amo.tp), fm(b.amo.rp)) +
    ligne('ITS', '', '', '', '', fm(b.its.rs), '', '') +
    ligne('CF', '', n(b.cf.base), '', '', '', t(b.cf.tp), fm(b.cf.rp)) +
    ligne('TL', '', n(b.tl.base), '', '', '', t(b.tl.tp), fm(b.tl.rp)) + vide(1) +
    '<tr class="lg"><td class="vl r">Total Cotisation</td><td class="vl"></td><td class="vl"></td><td class="vl"></td><td class="vl"></td><td class="vl r tot">' + fm(b.totSal) + '</td><td class="vl"></td><td class="vl r tot">' + fm(b.totPat) + '</td></tr>' + vide(1) +
    // Lignes 48 à 53 : retenues
    (b.retenue ? ligne('Retenue', '', '', '', '', fm(b.retenue), '', '') : '') +
    (b.pret ? ligne('Prêt', '', '', '', '', fm(b.pret), '', '') : '') + retRub +
    vide(Math.max(1, 6 - (b.retenue ? 1 : 0) - (b.pret ? 1 : 0) - b.rubRet.length)) +
    // Lignes 54 à 56 : récapitulatif
    '<tr><td class="bd l">Salaire brut</td><td colspan="2" class="bd c">Net Imposable</td><td colspan="2" class="bd c">Charges Salariales</td><td colspan="2" class="bd c">Charges Patronales</td><td class="bd c bleu">NET À PAYER</td></tr>' +
    '<tr class="som"><td class="bd c b">' + fm(b.brut) + ' CFA</td><td colspan="2" class="bd c b">' + fm(b.its.base) + ' CFA</td><td colspan="2" class="bd c b">' + fm(b.totSal) + ' CFA</td><td colspan="2" class="bd c b">' + fm(b.totPat) + ' CFA</td><td class="bd c b">' + fm(b.net) + (b.erreur ? '' : ' CFA') + '</td></tr>' +
    // Ligne 57 : signatures
    '<tr class="sig"><td class="c b">RH</td><td colspan="6" class="c">Pour vous aider à faire valoir vos droits, conservez ce bulletin de paie sans limitation de durée</td><td class="c b">Employé</td></tr>' +
    '</table></div>';
}
function pBulletin(m) {
  if (!S.emps.length) { m.innerHTML = top('Paie', 'Bulletin de paie') + '<div class="note info">Aucun salarié. Ajoutez-en dans le Formulaire.</div>'; return; }
  if (!findEmp(S.ui.bulMat)) S.ui.bulMat = S.emps[0].mat;
  var e = findEmp(S.ui.bulMat), r = RH.calcLigne(e, S.P, today()), b = RH.bulletin(e, r, S.P, S.ret[e.mat]);
  var ret = S.ret[e.mat] || {};
  var its = b.its;
  m.innerHTML = top('Paie', 'Bulletin de paie',
    '<button class="btn" type="button" id="bPrint">' + ic('print') + 'Imprimer ce bulletin</button><button class="btn nav-b" type="button" id="bAll">' + ic('print') + 'Bulletins de la période</button>') +
    '<div class="grid" style="grid-template-columns:300px minmax(0,1fr);align-items:start" id="bulGrid">' +
    '<div class="grid">' +
    '<div class="panel"><div class="panel-b grid">' +
    '<div class="field"><label for="bMat">Salarié</label>' + selMat('bMat', e.mat) + '</div>' +
    '<div class="field"><label for="bMode">Mode de paie</label><select id="bMode">' + ['Virement', 'Chèque', 'Espèce'].map(function (x) { return '<option' + (S.ui.modePaie === x ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select></div>' +
    '<div class="field"><label for="bRet">Retenue (avance, acompte…)</label><input id="bRet" inputmode="numeric" value="' + esc(ret.retenue || '') + '"></div>' +
    '<div class="field"><label for="bPret">Prêt</label><input id="bPret" inputmode="numeric" value="' + esc(ret.pret || '') + '"></div>' +
    '<div style="font-size:12px;color:var(--muted)">Période : du ' + fd(S.periode.debut) + ' au ' + fd(S.periode.fin) + ' (modifiable dans Personnels).</div></div></div>' +
    (r.statut !== 'Actif' ? '<div class="note warn">Ce salarié est sorti le ' + fd(e.sortie) + '.</div>' : '') +
    (b.erreur ? '<div class="note err">Le calcul de l\'ITS renvoie #DIV/0! (même résultat que dans le classeur Excel) : le revenu annuel imposable ne dépasse pas 330 000 F CFA, la formule « moins 2 points » divise alors par zéro.</div>' : '') +
    (!b.erreur && N(its.q64) < 0 ? '<div class="note err">L\'ITS calculé est négatif (' + fm(its.rs) + ' F), comme dans le classeur Excel : le taux net d\'ITS est inférieur à 2 %, la formule « moins 2 points » le rend négatif.</div>' : '') +
    '<details class="panel"><summary class="panel-h" style="cursor:pointer;list-style:none"><h2>Détail du calcul de l\'ITS</h2><span style="font-size:12px;color:var(--muted)">afficher</span></summary><div class="panel-b calcbox"><table>' +
    '<tr><td>Salaire brut mensuel ITS</td><td class="num">' + fm(its.q42) + '</td></tr><tr><td>Salaire annuel imposable</td><td class="num">' + fm(its.q44) + '</td></tr>' +
    ['1re tranche 0 à 330 000', '2e tranche 330 001 à 578 400', '3e tranche 578 401 à 1 176 400', '4e tranche 1 176 401 à 1 789 733', '5e tranche 1 789 734 à 2 384 195', '6e tranche 2 384 196 à 3 494 130', '7e tranche au-delà de 3 494 130'].map(function (l, i) { return '<tr><td>' + l + '</td><td class="num">' + fm(its.tranches[i], 2) + '</td></tr>'; }).join('') +
    '<tr class="hl"><td>ITS annuel brut</td><td class="num">' + fm(its.q57, 2) + '</td></tr><tr><td>Situation / enfants</td><td class="num">' + esc(e.situation) + ' / ' + fm(e.enfants) + '</td></tr><tr><td>Abattement charges familiales</td><td class="num">' + fp(its.q60, 1) + '</td></tr>' +
    '<tr><td>ITS annuel net</td><td class="num">' + fm(its.q61, 2) + '</td></tr><tr><td>Pourcentage ITS net</td><td class="num">' + fp(its.q62, 2) + '</td></tr><tr><td>Calcul moins 2 pts</td><td class="num">' + fp(its.q63, 2) + '</td></tr>' +
    '<tr><td>Nouvel ITS annuel net</td><td class="num">' + fm(its.q64) + '</td></tr><tr class="hl"><td>ITS mensuel</td><td class="num">' + fm(its.q65, 2) + '</td></tr></table></div></details>' +
    '</div><div class="paper-wrap"><div class="paper">' + bulletinHTML(e) + '</div></div></div>';
  if (window.innerWidth < 1200) $('#bulGrid').style.gridTemplateColumns = 'minmax(0,1fr)';
  $('#bMat').onchange = function () { S.ui.bulMat = this.value; save(); pBulletin(m); };
  $('#bMode').onchange = function () { S.ui.modePaie = this.value; save(); pBulletin(m); };
  function setRet() { S.ret[e.mat] = { retenue: numOuVide($('#bRet').value), pret: numOuVide($('#bPret').value) }; save(); pBulletin(m); }
  $('#bRet').onchange = setRet; $('#bPret').onchange = setRet;
  $('#bPrint').onclick = function () { imprimer(['<div class="paper">' + bulletinHTML(e) + '</div>']); };
  $('#bAll').onclick = bulletinsPeriode;
}
function bulletinsPeriode() {
  if (!RH.parseD(S.periode.debut) || !RH.parseD(S.periode.fin)) { alerte('Bulletins de paie', 'Renseignez d\'abord la période de paie (Début et Fin) en haut de la page Personnels.', 'warn'); return; }
  var pris = [], exclus = [];
  S.emps.forEach(function (e) { if (blank(e.mat)) return; (RH.presentSurPeriode(e, S.periode.debut, S.periode.fin) ? pris : exclus).push(e); });
  confirmer('Bulletins de paie', '<p style="margin:0">Période de paie du ' + fd(S.periode.debut) + ' au ' + fd(S.periode.fin) + '.</p>' +
    '<div class="note info">' + pris.length + ' bulletin(s) à imprimer.' + (exclus.length ? ' ' + exclus.length + ' salarié(s) sorti(s) ou pas encore embauché(s) sur la période, non repris : ' + exclus.map(function (e) { return e.mat; }).join(', ') + '.' : '') + '</div>' +
    '<p style="margin:0;font-size:12.5px;color:var(--muted)">Dans la fenêtre d\'impression, choisissez votre imprimante ou « Enregistrer au format PDF » pour obtenir un seul PDF avec tous les bulletins.</p>',
    'Imprimer', function () { imprimer(pris.map(function (e) { return '<div class="paper">' + bulletinHTML(e) + '</div>'; })); });
}

// ======================================================================
//  HEURES SUPPLÉMENTAIRES
// ======================================================================
function pHeures(m) {
  if (!S.emps.length) { m.innerHTML = top('Paie', 'Calcul des heures supplémentaires') + '<div class="note info">Aucun salarié.</div>'; return; }
  if (!findEmp(S.ui.hsMat)) S.ui.hsMat = S.emps[0].mat;
  var e = findEmp(S.ui.hsMat), g = S.ui.hsGrille, h = RH.heuresSup(e, g, S.P);
  var labs = [S.P.hs1, S.P.hs2, S.P.hs3, S.P.hs4].map(function (x) { return Math.round(x * 100) + '%'; });
  m.innerHTML = top('Paie', 'Calcul des heures supplémentaires', '<button class="btn amb" type="button" id="hRep">' + ic('arrow') + 'Reporter dans Personnels</button>') +
    '<div class="grid" style="grid-template-columns:minmax(0,1fr) minmax(0,1.6fr);align-items:start" id="hsGrid">' +
    '<div class="grid"><div class="panel"><div class="panel-b grid">' +
    '<div class="field"><label for="hMat">Salarié</label>' + selMat('hMat', e.mat) + '</div>' +
    '<div class="calcbox"><table><tr><td>Nom</td><td>' + esc(nomComplet(e)) + '</td></tr><tr><td>Salaire de base</td><td class="num">' + fm(h.base) + ' F</td></tr><tr><td>Taux horaire (base ÷ 173,33)</td><td class="num">' + fm(h.tauxH, 2) + ' F</td></tr></table></div></div></div>' +
    (h.respHS > 0 ? '<div class="note warn">' + esc(e.mat) + ' a déjà une indemnité de responsabilité : il n\'a pas droit aux heures supplémentaires.</div>' : '') +
    '<div class="note info">Majorations (Paramètres) : jour ouvrable de la 41e à la 48e heure ' + labs[0] + ', au-delà de la 48e heure ' + labs[1] + ', nuit ou jour férié (de jour) ' + labs[2] + ', jour férié de nuit ' + labs[3] + '.</div></div>' +
    '<div class="grid"><div class="panel"><div class="panel-h"><h2>Nombre d\'heures</h2><button class="btn sm" type="button" id="hClr">Vider la grille</button></div><div class="tbl-wrap"><table class="tbl hs-grid"><thead><tr><th>Semaine</th>' + labs.map(function (l) { return '<th class="num">' + l + '</th>'; }).join('') + '</tr></thead><tbody>' +
    [0, 1, 2, 3, 4].map(function (w) { return '<tr style="cursor:default"><td>Semaine ' + (w + 1) + '</td>' + [0, 1, 2, 3].map(function (k) { return '<td><input id="h' + w + k + '" inputmode="decimal" aria-label="Semaine ' + (w + 1) + ' ' + labs[k] + '" value="' + esc(g[w] && g[w][k] !== undefined ? g[w][k] : '') + '"></td>'; }).join('') + '</tr>'; }).join('') +
    '<tr class="tot" style="cursor:default"><td><b>Totaux</b></td>' + h.heures.map(function (x, k) { return '<td class="num"><b id="ht' + k + '">' + fm(x, 2) + '</b></td>'; }).join('') + '</tr></tbody></table></div></div>' +
    '<div class="panel"><div class="panel-h"><h2>Montant des heures supplémentaires</h2></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Éléments</th>' + labs.map(function (l) { return '<th class="num">Heures Sup ' + l + '</th>'; }).join('') + '</tr></thead><tbody id="hMont"></tbody></table></div></div></div></div>';
  if (window.innerWidth < 1100) $('#hsGrid').style.gridTemplateColumns = 'minmax(0,1fr)';
  function majMont() {
    var hh = RH.heuresSup(e, S.ui.hsGrille, S.P);
    hh.heures.forEach(function (x, k) { $('#ht' + k).textContent = fm(x, 2).replace(/<[^>]+>/g, ''); });
    $('#hMont').innerHTML = '<tr style="cursor:default"><td>Taux</td>' + hh.taux.map(function (t) { return '<td class="num">' + fm(t, 2) + '</td>'; }).join('') + '</tr>' +
      '<tr style="cursor:default"><td>Nb d\'heures</td>' + hh.heures.map(function (t) { return '<td class="num">' + fm(t, 2) + '</td>'; }).join('') + '</tr>' +
      '<tr style="cursor:default"><td><b>Montants</b></td>' + hh.montants.map(function (t) { return '<td class="num"><b>' + fm(t) + ' F</b></td>'; }).join('') + '</tr>';
  }
  majMont();
  $('#hMat').onchange = function () { S.ui.hsMat = this.value; save(); pHeures(m); };
  $$('.hs-grid input').forEach(function (inp) {
    inp.oninput = function () { var w = +inp.id[1], k = +inp.id[2]; S.ui.hsGrille[w] = S.ui.hsGrille[w] || []; S.ui.hsGrille[w][k] = numOuVide(inp.value); save(); majMont(); };
  });
  $('#hClr').onclick = function () { S.ui.hsGrille = [[], [], [], [], []]; save(); pHeures(m); };
  $('#hRep').onclick = function () {
    var hh = RH.heuresSup(e, S.ui.hsGrille, S.P), cles = ['hs10', 'hs25', 'hs50', 'hs100'];
    var mont = hh.montants.map(function (x) { return RH.ROUND(N(x), 0); });
    var deja = cles.some(function (k) { return N(e[k]) !== 0; });
    var msg = '<p style="margin:0">Reporter ces montants pour <b>' + esc(e.mat) + '</b> (' + esc(nomComplet(e)) + ') ?</p><div class="calcbox"><table>' +
      cles.map(function (k, i) { return '<tr><td>Heures Sup ' + labs[i] + '</td><td class="num">' + fm(mont[i]) + ' F CFA</td></tr>'; }).join('') + '</table></div>' +
      (deja ? '<div class="note warn">Attention : des heures sup sont déjà saisies pour ce salarié, elles seront remplacées.</div>' : '');
    confirmer('Report des heures supplémentaires', msg, 'Reporter', function () {
      cles.forEach(function (k, i) { e[k] = mont[i] === 0 ? '' : mont[i]; });
      save();
      dialog({ titre: 'Heures supplémentaires', html: '<div class="note ok">Montants reportés dans le tableau Personnels.</div><p style="margin:0">Voulez-vous vider la grille des heures pour le salarié suivant ?</p>',
        boutons: [{ t: 'Non' }, { t: 'Oui, vider', cls: 'pri', fn: function () { S.ui.hsGrille = [[], [], [], [], []]; save(); pHeures(m); } }] });
    }, 'amb');
  };
}

// ======================================================================
//  TABLEAU DE BORD
// ======================================================================
var filtresTDB = { contrat: '', dept: '' };
function pTableau(m) {
  var R = rows(), d = RH.tableauDeBord(R, S.P, today(), filtresTDB);
  var actifs = R.filter(function (x) { return x.r.statut === 'Actif'; });
  var contrats = uniq(actifs.map(function (x) { return x.e.contrat; })), depts = uniq(actifs.map(function (x) { return x.e.dept; }));
  function sel(id, lab, vals, cur) { return '<label for="' + id + '">' + lab + '</label><select id="' + id + '"><option value="">Tous</option>' + vals.map(function (v) { return '<option' + (cur === v ? ' selected' : '') + '>' + esc(v) + '</option>'; }).join('') + '</select>'; }
  m.innerHTML = top('Pilotage · ' + S.P.nom, 'Tableau de bord',
    '<div class="tdb-top">' + sel('fCon', 'Contrat', contrats, filtresTDB.contrat) + sel('fDep', 'Département', depts, filtresTDB.dept) + '<button class="btn" type="button" id="tRef">Actualiser</button></div>') +
    '<div class="kpis">' +
    kpi('Effectif global', d.effectif, '', d.genre.F + ' F · ' + d.genre.H + ' H' + (filtresTDB.contrat ? ' · ' + filtresTDB.contrat : ''), true) +
    kpi('Âge moyen', fm(d.ageMoyen), 'ans', filtresTDB.contrat ? 'contrat ' + filtresTDB.contrat : 'salariés actifs') +
    kpi('Ancienneté moyenne', fm(d.ancMoyenne), 'ans', 'salariés actifs') +
    kpi('Salaire moyen', fm(d.salaireMoyen), 'CFA', 'coût employeur moyen') +
    kpi('Masse salariale', fm(d.masse), 'CFA', 'mensuelle') +
    kpi('Turnover ' + d.annee, fp(d.turnover), '', d.departs + ' départ(s) · effectif ' + d.eff01 + ' → ' + d.eff31) + '</div>' +
    '<div class="tdb">' +
    chartPanel('Effectifs par département', chDepGenre(d.depGenre), true) +
    chartPanel('Répartition par contrat', chDonut(d.contrats)) +
    chartPanel('Masse salariale par département (F CFA)', chMasse(d.masseDep)) +
    chartPanel('Pyramide des âges' + (filtresTDB.dept ? ' · ' + filtresTDB.dept : ''), chDiverge(d.pyramide), true) +
    chartPanel('Tranches de salaire brut (CFA)' + (filtresTDB.dept ? ' · ' + filtresTDB.dept : ''), chDiverge(d.tranchesSal, 104), true) +
    '<div class="panel"><div class="panel-h"><h2>Prochains contrats à échéance</h2></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Salarié</th><th>Contrat</th><th class="num">Date fin</th></tr></thead><tbody>' +
    (d.echeances.length ? d.echeances.map(function (x) { return '<tr data-mat="' + esc(x.e.mat) + '"><td class="who"><b>' + esc(nomComplet(x.e)) + '</b><span>' + esc(x.e.poste) + '</span></td><td>' + contratPill(x.e.contrat) + '</td><td class="num">' + fd(x.e.fin) + '</td></tr>'; }).join('') : '<tr><td colspan="3" style="color:var(--muted)">Aucun contrat à échéance.</td></tr>') +
    '</tbody></table></div></div></div>';
  $('#fCon').onchange = function () { filtresTDB.contrat = this.value; pTableau(m); };
  $('#fDep').onchange = function () { filtresTDB.dept = this.value; pTableau(m); };
  $('#tRef').onclick = function () { pTableau(m); toast('Tableau de bord actualisé'); };
  $$('tr[data-mat]', m).forEach(function (tr) { tr.onclick = function () { ouvrirFiche(tr.dataset.mat); }; });
}
function uniq(a) { return a.filter(function (x, i) { return !blank(x) && a.indexOf(x) === i; }).sort(function (x, y) { return String(x).localeCompare(String(y), 'fr'); }); }
function chartPanel(t, svg, legende) {
  return '<div class="panel"><div class="panel-h"><h2>' + esc(t) + '</h2>' + (legende ? '<div class="legend"><span><i style="background:var(--f)"></i>F</span><span><i style="background:var(--h)"></i>H</span></div>' : '') + '</div><div class="panel-b chart">' + svg + '</div></div>';
}
function vide() { return '<div style="color:var(--muted);padding:20px 0">Aucune donnée.</div>'; }
function chDepGenre(data) { // barres horizontales empilées F/H
  if (!data.length) return vide();
  var W = 360, lw = 82, rh = 30, H = data.length * rh + 26, max = Math.max.apply(null, data.map(function (x) { return x.F + x.H; })) || 1;
  var sc = (W - lw - 30) / max, s = '';
  for (var t = 0; t <= max; t++) s += '<line x1="' + (lw + t * sc) + '" x2="' + (lw + t * sc) + '" y1="0" y2="' + (H - 20) + '" stroke="var(--line-2)"/><text x="' + (lw + t * sc) + '" y="' + (H - 6) + '" text-anchor="middle">' + t + '</text>';
  data.forEach(function (x, i) {
    var y = i * rh + 6;
    s += '<text x="' + (lw - 8) + '" y="' + (y + 13) + '" text-anchor="end" style="fill:var(--ink);font-weight:600">' + esc(x.dept) + '</text>';
    if (x.F) s += '<rect x="' + lw + '" y="' + y + '" width="' + x.F * sc + '" height="18" rx="3" fill="var(--f)"/><text x="' + (lw + x.F * sc / 2) + '" y="' + (y + 13) + '" text-anchor="middle" style="fill:#fff;font-weight:700">' + x.F + '</text>';
    if (x.H) s += '<rect x="' + (lw + x.F * sc) + '" y="' + y + '" width="' + x.H * sc + '" height="18" rx="3" fill="var(--h)"/><text x="' + (lw + (x.F + x.H / 2) * sc) + '" y="' + (y + 13) + '" text-anchor="middle" style="fill:#fff;font-weight:700">' + x.H + '</text>';
  });
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Effectifs par département">' + s + '</svg>';
}
function chDonut(data) {
  if (!data.length) return vide();
  var tot = data.reduce(function (a, x) { return a + x.n; }, 0), cx = 110, cy = 100, R = 80, r = 50, a0 = -Math.PI / 2, s = '';
  var cols = ['var(--navy-2)', 'var(--accent)', 'var(--gold)', 'var(--steel)', 'var(--amber)'];
  data.forEach(function (x, i) {
    var a1 = a0 + 2 * Math.PI * x.n / tot, big = a1 - a0 > Math.PI ? 1 : 0;
    if (data.length === 1) { s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (R + r) / 2 + '" fill="none" stroke="' + cols[0] + '" stroke-width="' + (R - r) + '"/>'; }
    else s += '<path d="M' + (cx + R * Math.cos(a0)) + ' ' + (cy + R * Math.sin(a0)) + 'A' + R + ' ' + R + ' 0 ' + big + ' 1 ' + (cx + R * Math.cos(a1)) + ' ' + (cy + R * Math.sin(a1)) + 'L' + (cx + r * Math.cos(a1)) + ' ' + (cy + r * Math.sin(a1)) + 'A' + r + ' ' + r + ' 0 ' + big + ' 0 ' + (cx + r * Math.cos(a0)) + ' ' + (cy + r * Math.sin(a0)) + 'Z" fill="' + cols[i % cols.length] + '"/>';
    s += '<rect x="240" y="' + (60 + i * 28) + '" width="12" height="12" rx="3" fill="' + cols[i % cols.length] + '"/><text x="260" y="' + (70 + i * 28) + '" style="fill:var(--ink);font-size:13px;font-weight:600">' + esc(x.contrat) + '</text><text x="400" y="' + (70 + i * 28) + '" text-anchor="end" style="fill:var(--ink);font-size:13px;font-weight:700">' + x.n + '  (' + Math.round(x.n / tot * 100) + ' %)</text>';
    a0 = a1;
  });
  s += '<text x="' + cx + '" y="' + (cy + 2) + '" text-anchor="middle" style="fill:var(--navy);font-size:24px;font-weight:800">' + tot + '</text><text x="' + cx + '" y="' + (cy + 18) + '" text-anchor="middle">salariés</text>';
  return '<svg viewBox="0 0 420 200" role="img" aria-label="Répartition par contrat">' + s + '</svg>';
}
function chMasse(data) {
  if (!data.length) return vide();
  var W = 360, lw = 82, rh = 30, H = data.length * rh + 6, max = Math.max.apply(null, data.map(function (x) { return x.v; })) || 1, sc = (W - lw - 64) / max, s = '';
  data.forEach(function (x, i) {
    var y = i * rh + 4;
    s += '<text x="' + (lw - 8) + '" y="' + (y + 13) + '" text-anchor="end" style="fill:var(--ink);font-weight:600">' + esc(x.dept) + '</text><rect x="' + lw + '" y="' + y + '" width="' + Math.max(x.v * sc, 1) + '" height="18" rx="3" fill="var(--navy-2)"/>' +
      '<text x="' + (lw + x.v * sc + 6) + '" y="' + (y + 13) + '" style="fill:var(--ink);font-weight:700">' + fm(x.v) + '</text>';
  });
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Masse salariale par département">' + s + '</svg>';
}
function chDiverge(data, lwIn) { // F à gauche, H à droite
  if (!data.length) return vide();
  var W = 360, lw = lwIn || 52, rh = 30, H = data.length * rh + 26, max = Math.max.apply(null, data.map(function (x) { return Math.max(x.F, x.H); })) || 1;
  var half = (W - lw - 20) / 2, mid = lw + half, sc = (half - 20) / max, s = '';
  for (var t = 0; t <= max; t++) { [-1, 1].forEach(function (sg) { if (t === 0 && sg < 0) return; var xx = mid + sg * t * sc; s += '<line x1="' + xx + '" x2="' + xx + '" y1="0" y2="' + (H - 20) + '" stroke="var(--line-2)"/><text x="' + xx + '" y="' + (H - 6) + '" text-anchor="middle">' + t + '</text>'; }); }
  s += '<line x1="' + mid + '" x2="' + mid + '" y1="0" y2="' + (H - 20) + '" stroke="var(--steel)"/>';
  data.forEach(function (x, i) {
    var y = i * rh + 6;
    s += '<text x="' + (lw - 8) + '" y="' + (y + 13) + '" text-anchor="end" style="fill:var(--ink);font-weight:600">' + esc(x.lab) + '</text>';
    if (x.F) s += '<rect x="' + (mid - x.F * sc) + '" y="' + y + '" width="' + x.F * sc + '" height="18" rx="3" fill="var(--f)"/><text x="' + (mid - x.F * sc - 6) + '" y="' + (y + 13) + '" text-anchor="end" style="fill:var(--ink);font-weight:700">' + x.F + '</text>';
    if (x.H) s += '<rect x="' + mid + '" y="' + y + '" width="' + x.H * sc + '" height="18" rx="3" fill="var(--h)"/><text x="' + (mid + x.H * sc + 6) + '" y="' + (y + 13) + '" style="fill:var(--ink);font-weight:700">' + x.H + '</text>';
  });
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img">' + s + '</svg>';
}

// ======================================================================
//  PARAMÉTRAGE DES RUBRIQUES (plan de paie)
// ======================================================================
function demanderMdp(suite) {
  if (estAdmin()) { paramDeverrouille = true; setTimeout(suite, 0); return; }
  alerte('Accès réservé', 'Cette action est réservée à l\'administrateur de l\'entreprise.\nDemandez-lui de vous donner le rôle « Administrateur » (Fichier › Utilisateurs).', 'warn');
}
var RUB_LEGALES = [
  ['S001', 'Salaire de base', 'Gain', 'Saisi par salarié', 'Oui', 'Oui'],
  ['S002', 'Indemnité spéciale 1973', 'Gain', '1 000 F (sauf stage)', 'Oui', 'Oui'],
  ['S003', 'Indemnité de cherté de vie 1974', 'Gain', '10 % du salaire de base', 'Oui', 'Oui'],
  ['S004', 'Indemnité de solidarité 1991', 'Gain', 'Catégorie A 2 000, B 5 000, C 6 000', 'Oui', 'Exonérée'],
  ['S005', "Prime d'ancienneté", 'Gain', "Taux d'ancienneté × salaire de base", 'Oui', 'Oui'],
  ['S006', 'Indemnité de transport', 'Gain', 'Saisi par salarié', 'Non', 'Exonérée jusqu\'à 10 % du base'],
  ['S007', 'Indemnité de caisse', 'Gain', 'Saisi par salarié', 'Non', 'Exonérée jusqu\'à 10 % du base'],
  ['S008', 'Indemnité de monture', 'Gain', 'Saisi par salarié', 'Non', 'Exonérée jusqu\'à 10 % du base'],
  ['S009', 'Indemnité de responsabilité', 'Gain', 'Saisi par salarié', 'Oui', 'Exonérée 60 000 ou 80 000 selon CA'],
  ['S010', 'Avantage en nature', 'Gain', 'Saisi par salarié', 'Oui', 'Imposable à 50 %'],
  ['S011', 'Heures supplémentaires (4 taux)', 'Gain', 'Calcul des heures sup', 'Oui', 'Oui'],
  ['S012', 'Sursalaire', 'Gain', 'Saisi ou calcul à l\'envers', 'Oui', 'Oui'],
  ['C001', 'INPS salarié / patronal', 'Cotisation', 'Taux des Paramètres × base cotisable', '—', 'INPS salarié déduit'],
  ['C002', 'AMO salarié 3,06 % / patronal 3,5 %', 'Cotisation', 'Taux × base cotisable', '—', '—'],
  ['C003', 'ITS', 'Impôt', 'Barème progressif, abattements familiaux', '—', '—'],
  ['C004', 'CF 3,5 % et TL 1 % (patronal)', 'Charge', 'Taux × salaire brut arrondi', '—', '—'],
  ['R001', 'Retenue (avance, acompte)', 'Retenue', 'Saisie sur le bulletin', '—', '—'],
  ['R002', 'Prêt', 'Retenue', 'Saisi sur le bulletin', '—', '—']
];
var MODES = { saisi: 'Saisi par salarié', fixe: 'Montant fixe pour tous', taux: '% du salaire de base' };
var rubSel = '';
function pRubriques(m) {
  S.P.rubriques = S.P.rubriques || [];
  var rubs = S.P.rubriques, lock = !paramDeverrouille;
  m.innerHTML = top('Réglages', 'Paramétrage des rubriques de paie',
    '<button class="btn pri" type="button" id="rNew">' + ic('plus') + 'Nouvelle rubrique</button><button class="btn" type="button" id="rEdit"' + (rubSel ? '' : ' disabled') + '>Modifier</button><button class="btn dan" type="button" id="rDel"' + (rubSel ? '' : ' disabled') + '>' + ic('trash') + 'Supprimer</button>' +
    (lock ? '<button class="btn" type="button" id="rUnlock">' + ic('lock') + 'Déverrouiller</button>' : '<button class="btn" type="button" id="rLock">' + ic('unlock') + 'Verrouiller</button>')) +
    (lock ? '<div class="note info" style="margin-bottom:8px">La création, la modification et la suppression des rubriques sont réservées à l\'administrateur de l\'entreprise.</div>' : '') +
    '<div class="panel" style="margin-bottom:8px"><div class="panel-h"><h2>Rubriques personnalisées</h2><span style="font-size:11px;color:var(--muted)">' + rubs.length + ' rubrique(s) · double-cliquez pour modifier</span></div><div class="tbl-wrap"><table class="tbl" id="rTbl"><thead><tr><th>Code</th><th>Intitulé</th><th>Type</th><th>Mode de calcul</th><th class="num">Valeur</th><th>Soumis INPS/AMO</th><th>Soumis ITS</th><th class="num">Salariés concernés</th><th>État</th></tr></thead><tbody>' +
    (rubs.length ? rubs.map(function (r) {
      var nb = S.emps.filter(function (e) { return r.mode !== 'saisi' || N(e.rub && e.rub[r.code]) !== 0; }).length;
      return '<tr data-code="' + esc(r.code) + '" class="' + (rubSel === r.code ? 'sel' : '') + '"><td class="mono">' + esc(r.code) + '</td><td><b>' + esc(r.lib) + '</b></td><td>' + (r.type === 'retenue' ? 'Retenue sur net' : 'Gain') + '</td><td>' + MODES[r.mode] + '</td>' +
        '<td class="num">' + (r.mode === 'saisi' ? '' : r.mode === 'taux' ? fm(r.valeur, 2) + ' %' : fm(r.valeur) + ' F') + '</td><td>' + (r.type === 'retenue' ? '—' : r.cot ? 'Oui' : 'Non') + '</td><td>' + (r.type === 'retenue' ? '—' : r.its ? 'Oui' : 'Non') + '</td>' +
        '<td class="num">' + nb + '</td><td>' + (r.actif === false ? '<span class="pill sortie">Inactive</span>' : '<span class="pill actif">Active</span>') + '</td></tr>';
    }).join('') : '<tr><td colspan="9" style="color:var(--muted)">Aucune rubrique personnalisée. Cliquez sur « Nouvelle rubrique » pour en créer une (prime de rendement, indemnité de logement, cotisation mutuelle…).</td></tr>') +
    '</tbody></table></div></div>' +
    '<div class="panel"><div class="panel-h"><h2>Rubriques légales du classeur</h2><span style="font-size:11px;color:var(--muted)">Calculées par les formules d\'origine, non modifiables</span></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Code</th><th>Intitulé</th><th>Type</th><th>Mode de calcul</th><th>Soumis INPS/AMO</th><th>Soumis ITS</th></tr></thead><tbody>' +
    RUB_LEGALES.map(function (r) { return '<tr style="cursor:default"><td class="mono">' + r[0] + '</td><td>' + esc(r[1]) + '</td><td>' + r[2] + '</td><td>' + esc(r[3]) + '</td><td>' + r[4] + '</td><td>' + esc(r[5]) + '</td></tr>'; }).join('') +
    '</tbody></table></div></div>';
  $$('#rTbl tr[data-code]').forEach(function (tr) {
    tr.onclick = function () { rubSel = tr.dataset.code; pRubriques(m); };
    tr.ondblclick = function () { rubSel = tr.dataset.code; demanderMdp(function () { formRubrique(m, rubSel); }); };
  });
  $('#rNew').onclick = function () { demanderMdp(function () { formRubrique(m, ''); }); };
  $('#rEdit').onclick = function () { demanderMdp(function () { formRubrique(m, rubSel); }); };
  $('#rDel').onclick = function () { demanderMdp(function () { supprimerRubrique(m, rubSel); }); };
  if ($('#rUnlock')) $('#rUnlock').onclick = function () { demanderMdp(function () { pRubriques(m); }); };
  if ($('#rLock')) $('#rLock').onclick = function () { paramDeverrouille = false; pRubriques(m); };
}
function prochainCodeRub() {
  var mx = 0; (S.P.rubriques || []).forEach(function (r) { var n = Number(String(r.code).slice(1)); if (n > mx) mx = n; });
  return 'U' + String(mx + 1).padStart(3, '0');
}
function formRubrique(m, code) {
  var r0 = (S.P.rubriques || []).filter(function (r) { return r.code === code; })[0];
  var r = r0 ? JSON.parse(JSON.stringify(r0)) : { code: prochainCodeRub(), lib: '', type: 'gain', mode: 'saisi', valeur: '', cot: true, its: true, actif: true };
  var v = dialog({ titre: (r0 ? 'Modifier la rubrique ' : 'Nouvelle rubrique ') + r.code,
    html: '<div class="grid g2">' +
      '<div class="field"><label>Code</label><input value="' + esc(r.code) + '" readonly style="background:#eceef1"></div>' +
      '<div class="field"><label for="rbLib">Intitulé (apparaît sur le bulletin)</label><input id="rbLib" value="' + esc(r.lib) + '" placeholder="Ex. Prime de rendement"></div>' +
      '<div class="field"><label for="rbType">Type</label><select id="rbType"><option value="gain"' + (r.type === 'gain' ? ' selected' : '') + '>Gain (ajouté au salaire brut)</option><option value="retenue"' + (r.type === 'retenue' ? ' selected' : '') + '>Retenue sur le net</option></select></div>' +
      '<div class="field"><label for="rbMode">Mode de calcul</label><select id="rbMode">' + Object.keys(MODES).map(function (k) { return '<option value="' + k + '"' + (r.mode === k ? ' selected' : '') + '>' + MODES[k] + '</option>'; }).join('') + '</select></div>' +
      '<div class="field" id="rbValF"><label for="rbVal" id="rbValL">Valeur</label><input id="rbVal" inputmode="decimal" value="' + esc(r.valeur) + '"></div>' +
      '<div class="field"><label for="rbActif">État</label><select id="rbActif"><option value="1"' + (r.actif !== false ? ' selected' : '') + '>Active</option><option value="0"' + (r.actif === false ? ' selected' : '') + '>Inactive (conservée, non calculée)</option></select></div>' +
      '</div><div id="rbSoum" class="panel"><div class="panel-b grid" style="gap:6px">' +
      '<label class="inline"><input type="checkbox" id="rbCot"' + (r.cot ? ' checked' : '') + '> Soumis aux cotisations INPS et AMO</label>' +
      '<label class="inline"><input type="checkbox" id="rbIts"' + (r.its ? ' checked' : '') + '> Soumis à l\'ITS</label>' +
      '<div style="font-size:11px;color:var(--muted)">Les gains entrent toujours dans le salaire brut, donc dans la CF et la TL patronales.</div></div></div><div id="rbErr"></div>',
    boutons: [{ t: 'Annuler' }, { t: 'Enregistrer', cls: 'pri', fn: function (dv) {
      r.lib = $('#rbLib', dv).value.trim(); r.type = $('#rbType', dv).value; r.mode = $('#rbMode', dv).value;
      r.valeur = r.mode === 'saisi' ? '' : numOuVide($('#rbVal', dv).value); r.actif = $('#rbActif', dv).value === '1';
      r.cot = r.type === 'gain' && $('#rbCot', dv).checked; r.its = r.type === 'gain' && $('#rbIts', dv).checked;
      if (!r.lib) { $('#rbErr', dv).innerHTML = '<div class="note warn">Saisissez l\'intitulé de la rubrique.</div>'; return false; }
      if (r.mode !== 'saisi' && r.valeur === '') { $('#rbErr', dv).innerHTML = '<div class="note warn">Saisissez ' + (r.mode === 'taux' ? 'le pourcentage' : 'le montant') + '.</div>'; return false; }
      if (r0) { var i = S.P.rubriques.indexOf(r0); S.P.rubriques[i] = r; } else S.P.rubriques.push(r);
      rubSel = r.code; save(); pRubriques(m); toast('Rubrique ' + r.code + ' enregistrée');
    } }]
  });
  function maj() {
    var mode = $('#rbMode', v).value, type = $('#rbType', v).value;
    $('#rbValF', v).hidden = mode === 'saisi';
    $('#rbValL', v).textContent = mode === 'taux' ? 'Pourcentage du salaire de base (%)' : 'Montant (F CFA)';
    $('#rbSoum', v).hidden = type === 'retenue';
  }
  $('#rbMode', v).onchange = maj; $('#rbType', v).onchange = maj; maj();
}
function supprimerRubrique(m, code) {
  var r = (S.P.rubriques || []).filter(function (x) { return x.code === code; })[0]; if (!r) return;
  var nb = S.emps.filter(function (e) { return e.rub && N(e.rub[code]) !== 0; }).length;
  confirmer('Supprimer la rubrique ' + code, '<p style="margin:0">Supprimer la rubrique <b>' + esc(r.lib) + '</b> ?</p>' +
    (nb ? '<div class="note warn">' + nb + ' salarié(s) ont un montant saisi pour cette rubrique : ces montants seront effacés.</div>' : '') +
    '<div class="note info">Pour la garder sans la calculer, choisissez plutôt « Inactive » dans Modifier.</div>', 'Supprimer', function () {
      S.P.rubriques = S.P.rubriques.filter(function (x) { return x.code !== code; });
      S.emps.forEach(function (e) { if (e.rub) delete e.rub[code]; });
      rubSel = ''; save(); pRubriques(m); toast('Rubrique ' + code + ' supprimée');
    }, 'dan');
}

// ======================================================================
//  ATTESTATION ET CERTIFICAT DE TRAVAIL
// ======================================================================
function docHTML(type, e) {
  var P = S.P, fem = e.genre === 'F', civ = fem ? 'Madame' : 'Monsieur', ee = fem ? 'e' : '';
  var q19 = e.contrat === 'CDI' ? 'à durée indéterminée (CDI)' : e.contrat === 'CDD' ? 'à durée déterminée (CDD)' : 'de stage';
  var corps;
  if (type === 'attestation') {
    corps = '<p>Je soussigné(e), ' + esc(P.fonctionSign) + ' de la société ' + esc(P.nom) + ', atteste que ' + civ + ' ' + esc(e.prenom) + ' ' + esc(e.nom) + ', né' + ee + ' le ' + RH.dateLettres(e.naissance) +
      ', matricule ' + esc(e.mat) + ', est employé' + ee + ' au sein de notre société depuis le ' + RH.dateLettres(e.entree) + ', en qualité de ' + esc(e.poste) + ' au département ' + esc(e.dept) + ', sous contrat ' + q19 + '.</p>' +
      '<p>La présente attestation est délivrée à l\'intéressé' + ee + ', à sa demande, pour servir et valoir ce que de droit.</p>';
  } else {
    var q17 = RH.dateLettres(e.sortie);
    corps = '<p>Je soussigné(e), ' + esc(P.fonctionSign) + ' de la société ' + esc(P.nom) + ', certifie que ' + civ + ' ' + esc(e.prenom) + ' ' + esc(e.nom) + ', né' + ee + ' le ' + RH.dateLettres(e.naissance) +
      ', matricule ' + esc(e.mat) + ', a été employé' + ee + ' au sein de notre société du ' + RH.dateLettres(e.entree) + ' au ' + (q17 === '' ? '...............' : q17) + ', en qualité de ' + esc(e.poste) + ' au département ' + esc(e.dept) + ', sous contrat ' + q19 + '.</p>' +
      '<p>À l\'issue de son contrat, ' + civ + ' ' + esc(e.nom) + ' quitte notre société libre de tout engagement.</p><p>Le présent certificat lui est délivré pour servir et valoir ce que de droit.</p>';
  }
  // Mise en page de la feuille Excel (C2:L28, paysage) : en-tête à gauche, logo à droite, titre centré, signature centrée dans la moitié droite
  return '<div class="dx"><div class="dx-h"><div><div class="nm">' + esc(String(P.nom).toUpperCase()) + '</div><div>' + esc(P.adresse) + ' - ' + esc(P.ville) + '</div><div>Tél. : ' + esc(P.tel) + '&nbsp;&nbsp; - &nbsp;&nbsp;' + esc(P.email) + '</div></div><div class="lg">' + logoHTML(70) + '</div></div>' +
    '<div class="dx-t">' + (type === 'attestation' ? 'ATTESTATION DE TRAVAIL' : 'CERTIFICAT DE TRAVAIL') + '</div><div class="dx-ref">Réf. : ' + esc(e.mat) + '/RH/' + today().slice(0, 4) + '</div>' +
    '<div class="dx-c">' + corps + '</div>' +
    '<div class="dx-sig"><div>Fait à ' + esc(P.ville) + ', le ' + RH.dateLettres(today()) + '</div><div class="f">' + esc(P.fonctionSign) + '</div><div class="n">' + esc(P.nomSign) + '</div><div class="c">(Signature et cachet)</div></div></div>';
}
function pDoc(m, type) {
  var cle = type === 'attestation' ? 'attMat' : 'certMat', titre = type === 'attestation' ? 'Attestation de travail' : 'Certificat de travail';
  if (!S.emps.length) { m.innerHTML = top('Documents', titre) + '<div class="note info">Aucun salarié.</div>'; return; }
  var e = findEmp(S.ui[cle]);
  var warn = '';
  if (!e) warn = '<div class="note info">Sélectionnez le salarié.</div>';
  else if (type === 'attestation' && !blank(e.sortie)) warn = '<div class="note warn">Attention : ce salarié a quitté la société. Utilisez plutôt le certificat de travail.</div>';
  else if (type === 'certificat' && blank(e.sortie)) warn = '<div class="note warn">Attention : aucune date de sortie n\'est saisie pour ce salarié dans le tableau Personnels.</div>';
  m.innerHTML = top('Documents', titre, '<button class="btn pri" type="button" id="dPrint"' + (e ? '' : ' disabled') + '>' + ic('print') + 'Imprimer</button>') +
    '<div class="grid" style="grid-template-columns:300px minmax(0,1fr);align-items:start" id="docGrid"><div class="grid"><div class="panel"><div class="panel-b grid"><div class="field"><label for="dMat">Salarié</label>' + selMat('dMat', e ? e.mat : '', true) + '</div>' +
    (e ? '<div style="font-weight:700">' + (e.genre === 'F' ? 'Madame' : 'Monsieur') + ' ' + esc(nomComplet(e)) + '</div>' : '') +
    '<div style="font-size:12.5px;color:var(--muted)">Choisissez le salarié dans la liste, vérifiez le document puis cliquez sur Imprimer.</div></div></div>' + warn + '</div>' +
    '<div class="paper-wrap"><div class="paper paysage">' + (e ? docHTML(type, e) : '<div class="doc"><p style="color:var(--muted)">Sélectionnez le salarié dans la liste à gauche.</p></div>') + '</div></div></div>';
  if (window.innerWidth < 1200) $('#docGrid').style.gridTemplateColumns = 'minmax(0,1fr)';
  $('#dMat').onchange = function () { S.ui[cle] = this.value; save(); pDoc(m, type); };
  $('#dPrint').onclick = function () { if (!e) { alerte(titre, 'Choisissez d\'abord le salarié.', 'warn'); return; } imprimer(['<div class="paper">' + docHTML(type, e) + '</div>'], true); };
}

// ======================================================================
//  PARAMÈTRES
// ======================================================================
function pParametres(m) {
  var P = S.P, dis = paramDeverrouille ? '' : ' disabled';
  var infos = [['nom', 'Nom de la structure'], ['adresse', 'Adresse (quartier)'], ['tel', 'Téléphone'], ['email', 'E-mail'], ['mention', 'Mention complémentaire (NIF, RCCM...)'], ['ville', 'Ville'], ['fonctionSign', 'Fonction du signataire'], ['nomSign', 'Nom du signataire']];
  var taux = [['tauxInpsSal', 'Taux INPS salarié (retraite)', '%'], ['tauxInpsEmp', 'Taux INPS employeur', '%'], ['ca', "Chiffre d'affaires annuel (F CFA)", ''], ['hs1', 'Heures sup : 1re majoration', '%'], ['hs2', 'Heures sup : 2e majoration', '%'], ['hs3', 'Heures sup : 3e majoration', '%'], ['hs4', 'Heures sup : 4e majoration', '%']];
  function tVal(t) { return t[2] === '%' ? RH.ROUND(P[t[0]] * 100, 4) : P[t[0]]; }
  m.innerHTML = top('Réglages', 'Paramètres de la structure', '<button class="btn" type="button" id="pListes">' + ic('doc') + 'Listes de référence</button>' + (paramDeverrouille ? '<button class="btn" type="button" id="pLock">' + ic('lock') + 'Verrouiller</button><button class="btn pri" type="button" id="pSave">Enregistrer</button>' : '<button class="btn nav-b" type="button" id="pUnlock">' + ic('unlock') + 'Déverrouiller pour modifier</button>')) +
    (paramDeverrouille ? '' : '<div class="note info" style="margin-bottom:14px">Pour modifier cette page, cliquez sur « Déverrouiller pour modifier » (réservé à l\'administrateur). La liste des salariés se gère dans la page Personnels (ajout par le Formulaire).</div>') +
    '<div class="panel" style="margin-bottom:10px"><div class="panel-h"><h2>Apparence : couleurs de l\'application</h2><span style="font-size:11px;color:var(--muted)">modifiable par chaque utilisateur</span></div><div class="panel-b themes">' + THEMES.map(function (t) { return '<button type="button" class="theme' + (((['vert', 'bleu', 'gris'].indexOf(S.ui.theme) >= 0 ? S.ui.theme : 'vert') === t[0]) ? ' on' : '') + '" data-th="' + t[0] + '"><span class="sw">' + t[2].map(function (c) { return '<i style="background:' + c + '"></i>'; }).join('') + '</span><b>' + t[1] + '</b></button>'; }).join('') + '</div></div>' +
    '<div class="grid g2" style="align-items:start"><div class="grid">' +
    '<div class="panel"><div class="panel-h"><h2>Information de la structure</h2></div><div class="panel-b grid g2">' + infos.map(function (c) { return '<div class="field"><label for="p_' + c[0] + '">' + esc(c[1]) + '</label><input id="p_' + c[0] + '" value="' + esc(P[c[0]]) + '"' + dis + '></div>'; }).join('') +
    '<div class="field"><label>Période (année du tableau de bord)</label><output style="padding:8px 10px;background:var(--line-2);border-radius:7px;font-weight:700">' + today().slice(0, 4) + '</output></div></div></div>' +
    '<div class="panel"><div class="panel-h"><h2>Logo de la structure</h2></div><div class="panel-b inline" style="gap:16px"><div style="background:#fff;border:1px solid var(--line);border-radius:8px;padding:10px;min-width:160px;min-height:80px;display:flex;align-items:center;justify-content:center">' + (P.logo ? '<img src="' + P.logo + '" alt="Logo" style="max-height:80px">' : '<span style="color:var(--muted)">Aucun logo</span>') + '</div>' +
    '<div class="grid" style="gap:8px"><button class="btn" type="button" id="pLogo"' + dis + '>Changer le logo</button>' + (P.logo ? '<button class="btn dan sm" type="button" id="pLogoDel"' + dis + '>Retirer le logo</button>' : '') + '<input type="file" id="pLogoFile" accept="image/*" hidden></div></div></div>' +
    '<div class="panel"><div class="panel-h"><h2>Taux et montants de calcul</h2></div><div class="panel-b grid g2">' + taux.map(function (t) { return '<div class="field"><label for="p_' + t[0] + '">' + esc(t[1]) + (t[2] ? ' (en %)' : '') + '</label><input id="p_' + t[0] + '" inputmode="decimal" value="' + esc(tVal(t)) + '"' + dis + '></div>'; }).join('') + '</div></div></div>' +
    '<div class="grid">' +
    '<div class="panel" hidden><div class="panel-h"><h2>Tranches d\'âge (tableau de bord)</h2></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Âge min</th><th>Âge max</th><th>Tranche</th></tr></thead><tbody>' +
    P.ages.map(function (a, i) { return '<tr style="cursor:default">' + [0, 1, 2].map(function (k) { return '<td><div class="field"><input id="pa' + i + k + '" value="' + esc(a[k] === null ? '' : a[k]) + '"' + dis + ' aria-label="Tranche âge ' + (i + 1) + '"></div></td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div></div>' +
    '<div class="panel" hidden><div class="panel-h"><h2>Tranches de salaire (tableau de bord)</h2></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Salaire min</th><th>Salaire max</th><th>Tranche</th></tr></thead><tbody>' +
    P.salaires.map(function (a, i) { return '<tr style="cursor:default">' + [0, 1, 2].map(function (k) { return '<td><div class="field"><input id="ps' + i + k + '" value="' + esc(a[k] === null ? '' : a[k]) + '"' + dis + ' aria-label="Tranche salaire ' + (i + 1) + '"></div></td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div></div>' +
    '<div class="panel"><div class="panel-h"><h2>Données</h2></div><div class="panel-b grid" style="gap:10px">' +
    '<div class="inline"><button class="btn" type="button" id="pBk">' + ic('dl') + 'Sauvegarder les données (.json)</button><button class="btn" type="button" id="pRs">Restaurer une sauvegarde</button></div>' +
    '<div class="inline"><button class="btn dan" type="button" id="pVider"' + dis + '>Supprimer tous les salariés</button></div></div></div>' +
    '</div></div>';
  $('#pListes').onclick = function () { location.hash = '#listes'; };
  $$('.theme', m).forEach(function (b) { b.onclick = function () { S.ui.theme = b.dataset.th; save(); appliquerTheme(); pParametres(m); toast('Thème « ' + b.querySelector('b').textContent + ' » appliqué'); }; });
  if (!paramDeverrouille) {
    $('#pUnlock').onclick = function () { demanderMdp(function () { pParametres(m); }); };
  } else {
    $('#pLock').onclick = function () { paramDeverrouille = false; pParametres(m); };
    $('#pSave').onclick = function () {
      infos.forEach(function (c) { P[c[0]] = $('#p_' + c[0]).value.trim(); });
      var ok = true;
      taux.forEach(function (t) { var v = numOuVide($('#p_' + t[0]).value); if (v === '') { ok = false; return; } P[t[0]] = t[2] === '%' ? v / 100 : v; });
      P.ages = P.ages.map(function (a, i) { return [N($('#pa' + i + '0').value), numOuVide($('#pa' + i + '1').value) === '' ? null : N($('#pa' + i + '1').value), $('#pa' + i + '2').value]; });
      P.salaires = P.salaires.map(function (a, i) { return [N($('#ps' + i + '0').value), numOuVide($('#ps' + i + '1').value) === '' ? null : N($('#ps' + i + '1').value), $('#ps' + i + '2').value]; });
      if (!ok) { alerte('Paramètres', 'Chaque taux doit être un nombre (exemple : 3,6).', 'warn'); return; }
      save(); toast('Paramètres enregistrés'); renderNav('parametres'); pParametres(m);
    };
    $('#pLogo').onclick = function () { $('#pLogoFile').click(); };
    $('#pLogoFile').onchange = function () {
      var f = this.files[0]; if (!f) return;
      var rd = new FileReader(); rd.onload = function () { P.logo = rd.result; save(); renderNav('parametres'); pParametres(m); toast('Logo remplacé'); }; rd.readAsDataURL(f);
    };
    if ($('#pLogoDel')) $('#pLogoDel').onclick = function () { P.logo = ''; save(); renderNav('parametres'); pParametres(m); };
    $('#pVider').onclick = function () {
      dialog({ titre: 'Vider les données', html: '<div class="note warn">Cette opération supprime TOUS les salariés du tableau Personnels et les heures supplémentaires saisies. Faites une sauvegarde avant de continuer.</div><div class="field"><label for="vid">Pour confirmer, tapez le mot VIDER en majuscules :</label><input id="vid" autocomplete="off"></div><div id="vidErr"></div>',
        boutons: [{ t: 'Annuler' }, { t: 'Vider', cls: 'dan', fn: function (v) {
          if ($('#vid', v).value !== 'VIDER') { $('#vidErr', v).innerHTML = '<div class="note err">Opération annulée : le mot saisi n\'est pas VIDER.</div>'; return false; }
          S.emps = []; S.ret = {}; S.ui.hsGrille = [[], [], [], [], []]; S.ui.hsMat = ''; S.ui.bulMat = ''; S.ui.attMat = ''; S.ui.certMat = ''; save();
          location.hash = '#formulaire'; route();
          alerte('Données effacées', 'Tous les salariés sont supprimés. Saisissez le premier salarié dans le formulaire.', 'ok');
        } }] });
    };
  }
  $('#pBk').onclick = sauvegarder; $('#pRs').onclick = function () { $('#fileRestore').click(); };
}


// ======================================================================
//  LISTES DE RÉFÉRENCE (menu caché, ouvert depuis Paramètres)
// ======================================================================
function pListes(m) {
  initListes();
  var lock = !paramDeverrouille;
  m.innerHTML = top('Paramètres', 'Listes de référence', '<a class="btn" href="#parametres">Retour aux paramètres</a>' + (lock ? '<button class="btn nav-b" type="button" id="lUnlock">' + ic('unlock') + 'Déverrouiller pour modifier</button>' : '')) +
    '<div class="note info" style="margin-bottom:8px">Ces listes alimentent les listes déroulantes du Formulaire et de la fiche salarié. Retirer un élément ne modifie pas les salariés qui l\'ont déjà.</div>' +
    '<div class="grid g3">' + LISTES.map(function (l) {
      var items = S.P.listes[l[0]] || [];
      return '<div class="panel"><div class="panel-h"><h2>' + l[1] + '</h2><span style="font-size:11px;color:var(--muted)">' + items.length + '</span></div><div class="tbl-wrap" style="max-height:260px"><table class="tbl"><tbody>' +
        (items.length ? items.map(function (it, i) {
          var nb = S.emps.filter(function (e) { return String(e[l[0]] || '') === it; }).length;
          return '<tr style="cursor:default"><td>' + esc(it) + '</td><td class="num" style="color:var(--muted);font-size:11px">' + nb + ' salarié' + (nb > 1 ? 's' : '') + '</td><td style="width:30px;text-align:center">' + (lock ? '' : '<button class="iconbtn" type="button" data-del="' + l[0] + '|' + i + '" title="Retirer">✕</button>') + '</td></tr>';
        }).join('') : '<tr><td style="color:var(--muted)">Liste vide</td></tr>') +
        '</tbody></table></div>' + (lock ? '' : '<div class="panel-b inline" style="flex-wrap:nowrap"><div class="field" style="flex:1"><input id="add_' + l[0] + '" placeholder="Ajouter…" aria-label="Ajouter à ' + l[1] + '"></div><button class="btn pri sm" type="button" data-add="' + l[0] + '">' + ic('plus') + 'Ajouter</button></div>') + '</div>';
    }).join('') + '</div>';
  if (lock) { $('#lUnlock').onclick = function () { demanderMdp(function () { pListes(m); }); }; return; }
  function ajouter(k) {
    var inp = $('#add_' + k), v = inp.value.trim(); if (!v) return;
    var arr = S.P.listes[k]; if (arr.some(function (x) { return x.toLowerCase() === v.toLowerCase(); })) { toast('« ' + v + ' » est déjà dans la liste'); return; }
    arr.push(v); save(); pListes(m); var ni = $('#add_' + k); if (ni) ni.focus(); toast('« ' + v + ' » ajouté');
  }
  $$('[data-add]', m).forEach(function (b) { b.onclick = function () { ajouter(b.dataset.add); }; });
  $$('input[id^="add_"]', m).forEach(function (inp) { inp.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') ajouter(inp.id.slice(4)); }); });
  $$('[data-del]', m).forEach(function (b) { b.onclick = function () {
    var p = b.dataset.del.split('|'), k = p[0], i = +p[1], v = S.P.listes[k][i];
    confirmer('Retirer de la liste', '<p style="margin:0">Retirer « ' + esc(v) + ' » de la liste ?</p>', 'Retirer', function () { S.P.listes[k].splice(i, 1); save(); pListes(m); }, 'dan');
  }; });
}
// ======================================================================
//  SAUVEGARDE / RESTAURATION
// ======================================================================
function sauvegarder() { telecharger('Sauvegarde RH ' + (S.P.nom || '') + ' ' + today() + '.json', JSON.stringify(S, null, 1), 'application/json'); toast('Sauvegarde téléchargée'); }

// ======================================================================
//  COMPTES, LICENCES ET SAUVEGARDE EN LIGNE (Supabase)
//  - chaque entreprise cliente a ses données, ses utilisateurs et sa licence ;
//  - les données sont gardées aussi sur l'ordinateur : l'application
//    fonctionne hors connexion et envoie les modifications au retour du réseau ;
//  - la clé ci-dessous est publique par conception : elle ne donne accès à
//    rien sans compte valide (contrôles faits dans la base, voir supabase/schema.sql).
// ======================================================================
var SUPA_URL = 'https://zawxbeofeamvaufybsve.supabase.co';
var SUPA_KEY = 'sb_publishable_kZa0FHZpiuZK_5_wfjNlbg_4ic9RP7b';
var EDITEUR = 'ABA GROUP';
var CL = { sess: null, espace: null, org: null, version: 0, dirty: false, envoi: false, horsLigne: false, derniere: null, dernierEnvoye: '', tEnvoi: null, erreur: '', timers: false };
IC.cloud = '<path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 9.5a4 4 0 0 1-.5 8.5z"/><path d="M12 11v5M9.5 13.5 12 11l2.5 2.5"/>';
IC.out = '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 16l-4-4 4-4M6 12h10"/>';
IC.key = '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l2 2M15 8l2 2"/>';
IC.shield = '<path d="M12 3 5 6v5c0 4.5 3 8.5 7 10 4-1.5 7-5.5 7-10V6z"/><path d="m9 12 2 2 4-4"/>';
IC.hist = '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>';

function lsGet(k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
function lsSet(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }

var ERR_FR = {
  invalid_credentials: 'Adresse e-mail ou mot de passe incorrect.',
  'Invalid login credentials': 'Adresse e-mail ou mot de passe incorrect.',
  email_not_confirmed: 'Votre adresse e-mail n\'est pas encore confirmée. Ouvrez le lien reçu par e-mail, puis connectez-vous.',
  'Email not confirmed': 'Votre adresse e-mail n\'est pas encore confirmée. Ouvrez le lien reçu par e-mail, puis connectez-vous.',
  user_already_exists: 'Un compte existe déjà avec cette adresse. Connectez-vous ou utilisez « Mot de passe oublié ».',
  email_exists: 'Un compte existe déjà avec cette adresse. Connectez-vous ou utilisez « Mot de passe oublié ».',
  weak_password: 'Mot de passe trop faible : 8 caractères minimum, avec lettres et chiffres.',
  over_email_send_rate_limit: 'Trop d\'e-mails envoyés. Réessayez dans quelques minutes.',
  over_request_rate_limit: 'Trop de tentatives. Réessayez dans quelques minutes.',
  same_password: 'Le nouveau mot de passe doit être différent de l\'ancien.',
  signup_disabled: 'La création de compte est fermée. Contactez ' + EDITEUR + '.',
  RESEAU: 'Pas de connexion Internet (ou serveur injoignable).',
  SESSION_EXPIREE: 'Votre session a expiré. Reconnectez-vous.',
  NON_CONNECTE: 'Votre session a expiré. Reconnectez-vous.',
  ACCES_REFUSE: 'Accès refusé : votre compte n\'a pas les droits nécessaires.',
  LICENCE_EXPIREE: 'La licence de cette entreprise n\'est plus valide. Contactez ' + EDITEUR + '.',
  LECTURE_SEULE: 'Votre compte est en lecture seule : les modifications ne sont pas enregistrées.',
  MAX_UTILISATEURS: 'Nombre maximal d\'utilisateurs atteint pour cette licence. Contactez ' + EDITEUR + ' pour l\'augmenter.',
  DERNIER_ADMIN: 'Impossible : l\'entreprise doit garder au moins un administrateur.',
  EMAIL_INVALIDE: 'Adresse e-mail invalide.',
  ROLE_INVALIDE: 'Rôle invalide.',
  NOM_OBLIGATOIRE: 'Le nom de l\'entreprise est obligatoire.',
  ESSAI_DEJA_UTILISE: 'L\'essai gratuit a déjà été utilisé avec ce compte. Contactez ' + EDITEUR + ' pour une licence.',
  DATES_INVALIDES: 'La date de fin doit être après la date de début.',
  TROP_VOLUMINEUX: 'Les données sont trop volumineuses (logo trop lourd ?). Réduisez la taille du logo.',
  SAUVEGARDE_INTROUVABLE: 'Sauvegarde introuvable.',
  ENTREPRISE_INTROUVABLE: 'Entreprise introuvable.'
};
function errFr(e) {
  var m = (e && (e.code && ERR_FR[e.code] ? e.code : e.message)) || '';
  return ERR_FR[m] || (m ? 'Erreur : ' + m : 'Erreur inconnue.');
}
function erreur(msg, code) { var e = new Error(msg); if (code) e.code = code; return e; }

function http(method, path, body, jeton) {
  var h = { apikey: SUPA_KEY, 'Content-Type': 'application/json' };
  if (jeton) h.Authorization = 'Bearer ' + jeton;
  return fetch(SUPA_URL + path, { method: method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' })
    .then(null, function () { var e = erreur('RESEAU'); e.reseau = true; throw e; })
    .then(function (r) {
      return r.text().then(function (t) {
        var j = null; try { j = t ? JSON.parse(t) : null; } catch (x) { j = null; }
        if (!r.ok) {
          var e = erreur((j && (j.message || j.msg || j.error_description || j.error)) || ('HTTP ' + r.status), j && (j.error_code || (j.code && String(j.code).indexOf('P0') !== 0 ? j.code : '')));
          e.status = r.status; throw e;
        }
        return j;
      });
    });
}
function majSession(j) {
  var u = j.user ? { id: j.user.id, email: j.user.email } : (CL.sess && CL.sess.user) || null;
  CL.sess = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at || Math.floor(Date.now() / 1000) + (Number(j.expires_in) || 3600), user: u };
  lsSet('rh_session', CL.sess);
}
function oublierSession() { CL.sess = null; lsSet('rh_session', null); }
var refreshEnCours = null;
function jeton(forcer) {
  if (!CL.sess) return Promise.reject(erreur('SESSION_EXPIREE'));
  if (!forcer && CL.sess.expires_at - 60 > Date.now() / 1000) return Promise.resolve(CL.sess.access_token);
  if (!refreshEnCours) {
    refreshEnCours = http('POST', '/auth/v1/token?grant_type=refresh_token', { refresh_token: CL.sess.refresh_token }).then(function (j) {
      refreshEnCours = null; majSession(j); return j.access_token;
    }, function (e) {
      refreshEnCours = null; if (e.reseau) throw e;
      oublierSession(); throw erreur('SESSION_EXPIREE');
    });
  }
  return refreshEnCours;
}
function rpc(nom, args) {
  function go(t) { return http('POST', '/rest/v1/rpc/' + nom, args || {}, t); }
  return jeton().then(go).then(null, function (e) {
    if (e.status === 401) return jeton(true).then(go);
    throw e;
  });
}
function urlApp() { return location.origin + location.pathname; }

// ---------- Écran de connexion (au-dessus de l'application) ----------
function authShow(html, bind) {
  var a = $('#auth');
  if (!a) { a = document.createElement('div'); a.id = 'auth'; a.className = 'auth'; document.body.appendChild(a); }
  a.hidden = false;
  a.innerHTML = '<div class="auth-card"><div class="auth-h"><span class="appico">RH</span><div><b>Gestion RH &amp; Paie</b><small>Logiciel de paie et de gestion du personnel</small></div></div><div class="auth-b">' + html + '</div></div><div class="auth-f">Édité par ' + EDITEUR + ' — Bamako · Version 2.0</div>';
  $$('.modal-veil').forEach(function (x) { x.remove(); });
  if (bind) bind(a);
  var f = $('input', a); if (f) f.focus();
  $$('form', a).forEach(function (fm) { fm.addEventListener('submit', function (ev) { ev.preventDefault(); }); });
}
function authHide() { var a = $('#auth'); if (a) { a.hidden = true; a.innerHTML = ''; } }
function authMsg(a, msg, type) { var z = $('.auth-msg', a); if (z) z.innerHTML = msg ? '<div class="note ' + (type || 'err') + '"><pre>' + esc(msg) + '</pre></div>' : ''; }
function authOcc(a, oui) { $$('button', a).forEach(function (b) { b.disabled = !!oui; }); }
function chp(id, lib, type, extra) { return '<div class="field"><label for="' + id + '">' + lib + '</label><input id="' + id + '" type="' + (type || 'text') + '"' + (extra || '') + '></div>'; }

function ecranChargement(msg) { authShow('<div class="auth-wait"><span class="spin"></span>' + esc(msg || 'Chargement…') + '</div>'); }
function ecranConnexion(msg, type) {
  var dernier = (lsGet('rh_dernier_email') || '');
  authShow('<h2>Connexion</h2><form class="grid" style="gap:12px">' + chp('aEmail', 'Adresse e-mail', 'email', ' autocomplete="username" value="' + esc(dernier) + '"') + chp('aMdp', 'Mot de passe', 'password', ' autocomplete="current-password"') +
    '<div class="auth-msg"></div><button class="btn pri big" type="submit" id="aGo">Se connecter</button></form>' +
    '<div class="auth-links"><a href="#" id="aOubli">Mot de passe oublié ?</a><a href="#" id="aInsc">Créer un compte</a></div>', function (a) {
    if (msg) authMsg(a, msg, type);
    if (dernier) setTimeout(function () { $('#aMdp', a).focus(); }, 0);
    $('#aGo', a).onclick = function () {
      var em = $('#aEmail', a).value.trim(), pw = $('#aMdp', a).value;
      if (!em || !pw) { authMsg(a, 'Saisissez votre adresse e-mail et votre mot de passe.'); return; }
      authOcc(a, true); authMsg(a, '');
      http('POST', '/auth/v1/token?grant_type=password', { email: em, password: pw }).then(function (j) {
        majSession(j); lsSet('rh_dernier_email', em); chargerEspace();
      }, function (e) { authOcc(a, false); authMsg(a, errFr(e)); });
    };
    $('#aOubli', a).onclick = function (ev) { ev.preventDefault(); ecranOubli($('#aEmail', a).value.trim()); };
    $('#aInsc', a).onclick = function (ev) { ev.preventDefault(); ecranInscription(); };
  });
}
function ecranInscription() {
  authShow('<h2>Créer un compte</h2><form class="grid" style="gap:12px">' + chp('aEmail', 'Adresse e-mail professionnelle', 'email', ' autocomplete="username"') + chp('aMdp', 'Mot de passe (8 caractères minimum)', 'password', ' autocomplete="new-password"') + chp('aMdp2', 'Confirmer le mot de passe', 'password', ' autocomplete="new-password"') +
    '<div class="auth-msg"></div><button class="btn pri big" type="submit" id="aGo">Créer mon compte</button></form>' +
    '<p class="auth-p">Si votre entreprise utilise déjà le logiciel, créez votre compte avec l\'adresse e-mail que votre administrateur a enregistrée : vous serez rattaché automatiquement.</p>' +
    '<div class="auth-links"><a href="#" id="aRet">J\'ai déjà un compte</a></div>', function (a) {
    $('#aRet', a).onclick = function (ev) { ev.preventDefault(); ecranConnexion(); };
    $('#aGo', a).onclick = function () {
      var em = $('#aEmail', a).value.trim(), pw = $('#aMdp', a).value;
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { authMsg(a, 'Adresse e-mail invalide.'); return; }
      if (pw.length < 8) { authMsg(a, 'Le mot de passe doit contenir au moins 8 caractères.'); return; }
      if (pw !== $('#aMdp2', a).value) { authMsg(a, 'Les deux mots de passe ne sont pas identiques.'); return; }
      authOcc(a, true); authMsg(a, '');
      http('POST', '/auth/v1/signup?redirect_to=' + encodeURIComponent(urlApp()), { email: em, password: pw }).then(function (j) {
        lsSet('rh_dernier_email', em);
        if (j && j.access_token) { majSession(j); chargerEspace(); }
        else ecranConnexion('Compte créé. Un e-mail de confirmation a été envoyé à ' + em + '.\nOuvrez le lien qu\'il contient, puis connectez-vous.', 'ok');
      }, function (e) { authOcc(a, false); authMsg(a, errFr(e)); });
    };
  });
}
function ecranOubli(em) {
  authShow('<h2>Mot de passe oublié</h2><p class="auth-p">Saisissez votre adresse : vous recevrez un lien pour choisir un nouveau mot de passe.</p><form class="grid" style="gap:12px">' + chp('aEmail', 'Adresse e-mail', 'email', ' value="' + esc(em || '') + '"') +
    '<div class="auth-msg"></div><button class="btn pri big" type="submit" id="aGo">Envoyer le lien</button></form><div class="auth-links"><a href="#" id="aRet">Retour à la connexion</a></div>', function (a) {
    $('#aRet', a).onclick = function (ev) { ev.preventDefault(); ecranConnexion(); };
    $('#aGo', a).onclick = function () {
      var e2 = $('#aEmail', a).value.trim(); if (!e2) { authMsg(a, 'Saisissez votre adresse e-mail.'); return; }
      authOcc(a, true);
      http('POST', '/auth/v1/recover?redirect_to=' + encodeURIComponent(urlApp()), { email: e2 }).then(function () {
        ecranConnexion('Si un compte existe pour ' + e2 + ', un e-mail avec un lien de réinitialisation vient d\'être envoyé.', 'ok');
      }, function (e) { authOcc(a, false); authMsg(a, errFr(e)); });
    };
  });
}
function formMdp(a, suite) {
  $('#aGo', a).onclick = function () {
    var pw = $('#aMdp', a).value;
    if (pw.length < 8) { authMsg(a, 'Le mot de passe doit contenir au moins 8 caractères.'); return; }
    if (pw !== $('#aMdp2', a).value) { authMsg(a, 'Les deux mots de passe ne sont pas identiques.'); return; }
    authOcc(a, true);
    jeton().then(function (t) { return http('PUT', '/auth/v1/user', { password: pw }, t); }).then(suite, function (e) { authOcc(a, false); authMsg(a, errFr(e)); });
  };
}
function ecranNouveauMdp() {
  authShow('<h2>Nouveau mot de passe</h2><form class="grid" style="gap:12px">' + chp('aMdp', 'Nouveau mot de passe (8 caractères minimum)', 'password', ' autocomplete="new-password"') + chp('aMdp2', 'Confirmer', 'password', ' autocomplete="new-password"') +
    '<div class="auth-msg"></div><button class="btn pri big" type="submit" id="aGo">Enregistrer le mot de passe</button></form>', function (a) {
    formMdp(a, function () { toast('Mot de passe modifié'); chargerEspace(); });
  });
}
function changerMonMdp() {
  var v = dialog({ titre: 'Changer mon mot de passe', html: '<form class="grid" style="gap:10px">' + chp('aMdp', 'Nouveau mot de passe (8 caractères minimum)', 'password', ' autocomplete="new-password"') + chp('aMdp2', 'Confirmer', 'password', ' autocomplete="new-password"') + '<div class="auth-msg"></div><button hidden id="aGo" type="submit"></button></form>',
    boutons: [{ t: 'Annuler' }, { t: 'Enregistrer', cls: 'pri', fn: function (w) { $('#aGo', w).click(); return false; } }] });
  $('form', v).addEventListener('submit', function (ev) { ev.preventDefault(); });
  formMdp(v, function () { v.remove(); toast('Mot de passe modifié'); });
}

// ---------- Espace : entreprises, licences ----------
function licenceValide(o) {
  if (!CL.horsLigne) return !!o.licence_ok;
  var t = today(); return o.actif && t >= o.licence_debut && t <= o.licence_fin;
}
function estEditeur() { return !!(CL.espace && CL.espace.editeur); }
function estAdmin() { return estEditeur() || !!(CL.org && CL.org.role === 'admin'); }
function lectureSeule() { return !!(CL.org && CL.org.role === 'lecture'); }
var ROLES = { admin: 'Administrateur', gestionnaire: 'Gestionnaire de paie', lecture: 'Consultation seule' };

function chargerEspace() {
  ecranChargement('Connexion…');
  rpc('mon_espace').then(function (esp) {
    CL.espace = esp; CL.horsLigne = false;
    if (CL.sess && !CL.sess.user) { CL.sess.user = { id: esp.user_id, email: esp.email }; lsSet('rh_session', CL.sess); }
    lsSet('rh_espace_' + esp.user_id, esp);
    choisirEntreprise(false);
  }, function (e) {
    var c = CL.sess && CL.sess.user && lsGet('rh_espace_' + CL.sess.user.id);
    if (e.reseau && c) { CL.espace = c; CL.horsLigne = true; choisirEntreprise(false); }
    else if (e.reseau) ecranConnexion('Pas de connexion Internet. La première connexion sur cet ordinateur doit se faire en ligne.');
    else { oublierSession(); ecranConnexion(errFr(e)); }
  });
}
function choisirEntreprise(forcer) {
  var orgs = CL.espace.organisations || [], der = lsGet('rh_derniere_org');
  if (!forcer) {
    if (orgs.length === 1) return ouvrirOrg(orgs[0]);
    var d = orgs.filter(function (o) { return o.id === der; })[0]; if (d) return ouvrirOrg(d);
  }
  var em = (CL.espace.email || (CL.sess && CL.sess.user && CL.sess.user.email) || '');
  var liste = orgs.map(function (o) {
    var ok = licenceValide(o);
    return '<button type="button" class="org" data-id="' + esc(o.id) + '"><b>' + esc(o.nom) + '</b><span>' + esc(ROLES[o.role] || o.role) + ' · ' + (ok ? (o.essai ? 'Essai jusqu\'au ' : 'Licence jusqu\'au ') + fd(o.licence_fin) : '<em>Licence expirée</em>') + '</span></button>';
  }).join('');
  var vide = !orgs.length ? '<div class="note info"><pre>Votre compte (' + esc(em) + ') n\'est rattaché à aucune entreprise.\n\n• Si votre entreprise a une licence, demandez à son administrateur de vous ajouter avec cette adresse e-mail.\n• Pour acheter une licence annuelle, contactez ' + EDITEUR + '.</pre></div>' : '';
  var essai = CL.espace.essai_possible && !CL.horsLigne ? '<details class="essai"' + (orgs.length ? '' : ' open') + '><summary>Essayer gratuitement pendant 30 jours</summary><form class="grid" style="gap:10px;margin-top:10px">' + chp('aNom', 'Nom de votre entreprise', 'text') + '<div class="auth-msg"></div><button class="btn pri" type="submit" id="aEssai">Démarrer l\'essai</button></form></details>' : '';
  authShow('<h2>' + (orgs.length ? 'Choisir l\'entreprise' : 'Bienvenue') + '</h2>' + (CL.horsLigne ? '<div class="note warn" style="margin-bottom:10px"><pre>Hors connexion : travail sur les données gardées sur cet ordinateur.</pre></div>' : '') + vide + '<div class="orgs">' + liste + '</div>' + essai +
    '<div class="auth-links">' + (estEditeur() ? '<a href="#" id="aConsole">Console éditeur (licences)</a>' : '') + '<a href="#" id="aOut">Se déconnecter (' + esc(em) + ')</a></div>', function (a) {
    $$('.org', a).forEach(function (b) { b.onclick = function () { ouvrirOrg(orgs.filter(function (o) { return o.id === b.dataset.id; })[0]); }; });
    $('#aOut', a).onclick = function (ev) { ev.preventDefault(); deconnexion(); };
    if ($('#aConsole', a)) $('#aConsole', a).onclick = function (ev) { ev.preventDefault(); ouvrirSansOrg(); location.hash = '#editeur'; route(); };
    if ($('#aEssai', a)) $('#aEssai', a).onclick = function () {
      var nom = $('#aNom', a).value.trim(); if (!nom) { authMsg(a, 'Saisissez le nom de votre entreprise.'); return; }
      authOcc(a, true);
      rpc('creer_essai', { p_nom: nom }).then(function (id) { lsSet('rh_derniere_org', id); chargerEspace(); }, function (e) { authOcc(a, false); authMsg(a, errFr(e)); });
    };
  });
}
function ecranLicence(o) {
  CL.org = null; clearTimeout(CL.tEnvoi);
  authShow('<h2>Licence expirée</h2><div class="note err"><pre>La licence de « ' + esc(o.nom) + ' » ' + (o.actif === false ? 'est suspendue.' : 'a expiré le ' + fd(o.licence_fin) + '.') + '\n\nVos données sont conservées. Pour renouveler la licence annuelle, contactez ' + EDITEUR + '.</pre></div>' +
    '<div class="auth-links">' + ((CL.espace.organisations || []).length > 1 || estEditeur() ? '<a href="#" id="aChg">Changer d\'entreprise</a>' : '') + '<a href="#" id="aRe">Vérifier à nouveau</a><a href="#" id="aOut">Se déconnecter</a></div>', function (a) {
    if ($('#aChg', a)) $('#aChg', a).onclick = function (ev) { ev.preventDefault(); choisirEntreprise(true); };
    $('#aRe', a).onclick = function (ev) { ev.preventDefault(); lsSet('rh_derniere_org', o.id); chargerEspace(); };
    $('#aOut', a).onclick = function (ev) { ev.preventDefault(); deconnexion(); };
  });
}
function ecranErreur(msg, o) {
  authShow('<h2>Ouverture impossible</h2><div class="note err"><pre>' + esc(msg) + '</pre></div><div class="auth-links"><a href="#" id="aRe">Réessayer</a><a href="#" id="aChg">Changer d\'entreprise</a><a href="#" id="aOut">Se déconnecter</a></div>', function (a) {
    $('#aRe', a).onclick = function (ev) { ev.preventDefault(); if (o) ouvrirOrg(o); else chargerEspace(); };
    $('#aChg', a).onclick = function (ev) { ev.preventDefault(); choisirEntreprise(true); };
    $('#aOut', a).onclick = function (ev) { ev.preventDefault(); deconnexion(); };
  });
}

// ---------- Données de l'entreprise ----------
function etatVierge(nom) {
  var P = JSON.parse(JSON.stringify(RH.PARAM_DEFAUT));
  ['adresse', 'tel', 'email', 'mention', 'fonctionSign', 'nomSign'].forEach(function (k) { P[k] = ''; });
  P.nom = nom || ''; P.logo = '';
  var d = new Date(), y = d.getFullYear(), m = d.getMonth() + 1, fin = new Date(y, m, 0).getDate();
  return { v: 1, P: P, emps: [], periode: { debut: y + '-' + String(m).padStart(2, '0') + '-01', fin: y + '-' + String(m).padStart(2, '0') + '-' + fin }, ui: uiDefaut(), ret: {} };
}
function uiDefaut() { return { bulMat: '', modePaie: 'Virement', hsMat: '', hsGrille: [[], [], [], [], []], attMat: '', certMat: '', vue: 'resume' }; }
function contenu() { var c = {}; Object.keys(S).forEach(function (k) { if (k !== 'ui') c[k] = S[k]; }); return c; }
function cleContenu() { var c = contenu(); delete c.maj; return JSON.stringify(c); }
function ecrireCache() { if (CL.org) lsSet('rh_org_' + CL.org.id, { version: CL.version, dirty: CL.dirty, data: contenu() }); }

function appliquer(data, version, dirty) {
  var ui = (CL.org && lsGet('rh_ui_' + CL.org.id)) || (S && S.ui) || uiDefaut();
  S = data; S.ui = ui; S.ret = S.ret || {}; S.P = S.P || etatVierge('').P; S.emps = S.emps || [];
  if (!S.periode) S.periode = etatVierge('').periode;
  ['bulMat', 'hsMat', 'attMat', 'certMat'].forEach(function (k) { if (S.ui[k] && !S.emps.some(function (e) { return String(e.mat) === String(S.ui[k]); })) S.ui[k] = ''; });
  CL.version = version; CL.dirty = false; CL.dernierEnvoye = dirty ? '' : cleContenu(); CL.dirty = !!dirty && !lectureSeule();
  if (!CL.dirty) CL.derniere = CL.derniere || new Date();
  initListes(); appliquerTheme(); ecrireCache();
  authHide(); construireChrome(); route(); majEtatCloud(); demarrerSuivi();
  if (CL.dirty) planifierEnvoi(0);
}
function ouvrirOrg(o) {
  if (!o) return choisirEntreprise(true);
  if (!licenceValide(o)) return ecranLicence(o);
  if (CL.org && CL.org.id !== o.id) { CL.derniere = null; }
  CL.org = o; lsSet('rh_derniere_org', o.id);
  var cache = lsGet('rh_org_' + o.id);
  ecranChargement('Ouverture de « ' + o.nom + ' »…');
  if (CL.horsLigne) {
    if (cache) return appliquer(cache.data, cache.version, cache.dirty);
    return ecranErreur('Pas de connexion Internet et aucune copie de « ' + o.nom + ' » sur cet ordinateur.', o);
  }
  rpc('charger', { o: o.id }).then(function (srv) {
    if (cache && cache.dirty && !lectureSeule()) {
      if (cache.version === srv.version) return appliquer(cache.data, cache.version, true);
      return conflit({ version: srv.version, contenu: srv.contenu, maj_le: srv.maj_le }, cache.data);
    }
    if (srv.contenu) return appliquer(srv.contenu, srv.version, false);
    var anc = lsGet(KEY);
    if (anc && Array.isArray(anc.emps) && anc.emps.length && !lectureSeule()) return proposerImport(anc);
    appliquer(etatVierge(o.nom), 0, !lectureSeule());
  }, function (e) {
    if (e.reseau && cache) { CL.horsLigne = true; appliquer(cache.data, cache.version, cache.dirty); }
    else if (e.reseau) ecranErreur('Pas de connexion Internet.', o);
    else if (e.message === 'LICENCE_EXPIREE') { o.licence_ok = false; ecranLicence(o); }
    else if (e.message === 'SESSION_EXPIREE') ecranConnexion(errFr(e));
    else ecranErreur(errFr(e), o);
  });
}
function ouvrirSansOrg() {
  CL.org = null; clearTimeout(CL.tEnvoi);
  S = etatVierge(EDITEUR); S.ui = uiDefaut();
  initListes(); appliquerTheme(); authHide(); construireChrome(); majEtatCloud();
}
function proposerImport(anc) {
  var o = CL.org;
  authShow('<h2>Reprendre vos données ?</h2><div class="note info"><pre>Des données de l\'ancienne version (enregistrées dans ce navigateur) ont été trouvées :\n« ' + esc(anc.P && anc.P.nom) + ' » — ' + anc.emps.length + ' salarié(s).\n\nVoulez-vous les importer dans « ' + esc(o.nom) + ' » ?</pre></div>' +
    '<div class="inline" style="justify-content:flex-end;margin-top:14px"><button class="btn" type="button" id="aNon">Commencer avec une base vide</button><button class="btn pri" type="button" id="aOui">Importer ces données</button></div>', function (a) {
    $('#aOui', a).onclick = function () { var d = JSON.parse(JSON.stringify(anc)); delete d.ui; appliquer(d, 0, true); toast('Données importées — envoi en ligne…'); };
    $('#aNon', a).onclick = function () { appliquer(etatVierge(o.nom), 0, true); };
  });
}
function conflit(r, mienne) {
  var quand = r.maj_le ? new Date(r.maj_le) : null;
  var q = quand ? ' le ' + fd(quand.toISOString().slice(0, 10)) + ' à ' + String(quand.getHours()).padStart(2, '0') + ':' + String(quand.getMinutes()).padStart(2, '0') : '';
  var nAutre = r.contenu && r.contenu.emps ? r.contenu.emps.length : 0, nMoi = mienne && mienne.emps ? mienne.emps.length : 0;
  authHide();
  dialog({ titre: 'Modifications simultanées', bloquant: true,
    html: '<div class="note warn"><pre>Un autre utilisateur a enregistré des modifications' + q + ' pendant que vous travailliez.\n\n• Version en ligne : ' + nAutre + ' salarié(s)\n• Votre version (cet ordinateur) : ' + nMoi + ' salarié(s)\n\nChoisissez la version à garder. L\'autre version reste disponible dans l\'historique des sauvegardes (administrateur) ; vous pouvez aussi télécharger la vôtre.</pre></div>',
    boutons: [{ t: 'Télécharger ma version', fn: function () { telecharger('Ma version ' + today() + '.json', JSON.stringify(mienne, null, 1), 'application/json'); return false; } },
      { t: 'Garder la version en ligne', fn: function () { appliquer(r.contenu || etatVierge(CL.org.nom), r.version, false); toast('Version en ligne chargée'); } },
      { t: 'Garder ma version', cls: 'pri', fn: function () { appliquer(JSON.parse(JSON.stringify(mienne)), r.version, true); } }] });
}

// ---------- Envoi et suivi ----------
function save() {
  if (!S) return;
  if (CL.org) lsSet('rh_ui_' + CL.org.id, S.ui);
  if (CL.org && !lectureSeule()) {
    var cle = cleContenu();
    CL.dirty = cle !== CL.dernierEnvoye;
    if (CL.dirty) { if (CL.derniereCle !== cle) { S.maj = new Date().toISOString(); CL.derniereCle = cle; } planifierEnvoi(); }
    ecrireCache();
  }
  majEtatCloud();
}
function planifierEnvoi(ms) { clearTimeout(CL.tEnvoi); CL.tEnvoi = setTimeout(envoyer, ms === undefined ? 1500 : ms); }
function envoyer() {
  if (!CL.org || !CL.dirty || CL.envoi || lectureSeule()) return Promise.resolve(false);
  var org = CL.org, c = contenu(), cle = cleContenu();
  CL.envoi = true; majEtatCloud();
  return rpc('enregistrer', { o: org.id, c: c, v: CL.version }).then(function (r) {
    CL.envoi = false; if (CL.org !== org) return false;
    CL.horsLigne = false; CL.erreur = '';
    if (r.ok) {
      CL.version = r.version; CL.dernierEnvoye = cle; CL.dirty = cleContenu() !== cle; CL.derniere = new Date();
      ecrireCache(); majEtatCloud(); if (CL.dirty) planifierEnvoi();
      return true;
    }
    if (r.conflit) conflit(r, contenu());
    return false;
  }, function (e) {
    CL.envoi = false; if (CL.org !== org) return false;
    if (e.reseau) CL.horsLigne = true;
    else if (e.message === 'SESSION_EXPIREE') { ecranConnexion(errFr(e) + '\nVos modifications sont gardées sur cet ordinateur et seront envoyées après la connexion.', 'warn'); }
    else if (e.message === 'LICENCE_EXPIREE') { org.licence_ok = false; ecranLicence(org); }
    else if (e.message === 'LECTURE_SEULE') { org.role = 'lecture'; CL.dirty = false; ecrireCache(); construireChrome(); alerte('Lecture seule', errFr(e), 'warn'); }
    else CL.erreur = errFr(e);
    majEtatCloud(); return false;
  });
}
function synchroniser(manuel) {
  if (!CL.org) return;
  if (CL.dirty) { envoyer().then(function (ok) { if (manuel) toast(ok ? 'Données envoyées en ligne' : (CL.horsLigne ? 'Hors connexion : envoi impossible pour le moment' : 'Envoi impossible')); }); return; }
  var org = CL.org;
  rpc('etat', { o: org.id }).then(function (r) {
    if (CL.org !== org) return;
    CL.horsLigne = false;
    if (r.role !== org.role) { org.role = r.role; construireChrome(); majEtatCloud(); }
    org.licence_fin = r.licence_fin;
    if (!r.licence_ok) { org.licence_ok = false; ecranLicence(org); return; }
    if (r.version > CL.version && !CL.dirty) {
      var occupe = document.activeElement && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) || $('.modal-veil');
      if (occupe && !manuel) return;
      return rpc('charger', { o: org.id }).then(function (srv) { if (CL.org === org && !CL.dirty) { appliquer(srv.contenu, srv.version, false); toast('Données mises à jour (modifications d\'un autre utilisateur)'); } });
    }
    majEtatCloud(); if (manuel) toast('Données à jour');
  }).then(null, function (e) {
    if (e.reseau) { CL.horsLigne = true; majEtatCloud(); if (manuel) toast('Hors connexion'); }
    else if (e.message === 'ACCES_REFUSE') ecranErreur('Votre accès à cette entreprise a été retiré.', null);
    else if (e.message === 'SESSION_EXPIREE') ecranConnexion(errFr(e), 'warn');
  });
}
function demarrerSuivi() {
  if (CL.timers) return; CL.timers = true;
  setInterval(function () { if (CL.org && navigator.onLine !== false) synchroniser(false); }, 60000);
  window.addEventListener('online', function () { CL.horsLigne = false; synchroniser(false); });
  window.addEventListener('offline', function () { CL.horsLigne = true; majEtatCloud(); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && CL.org) synchroniser(false); });
}
function hm(d) { return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
function majEtatCloud() {
  var el = $('#autoState'), st = $('#saveState');
  if (!el || !st) return;
  if (!CL.org) { el.innerHTML = estEditeur() ? '<span class="dot"></span>Console éditeur' : ''; }
  else if (lectureSeule()) el.innerHTML = '<span class="dot warn"></span>Consultation seule : les modifications ne sont pas enregistrées';
  else if (CL.envoi) el.innerHTML = '<span class="dot warn"></span>Envoi en ligne…';
  else if (CL.dirty && CL.horsLigne) el.innerHTML = '<span class="dot warn"></span>Hors connexion — modifications gardées sur cet ordinateur';
  else if (CL.erreur) el.innerHTML = '<span class="dot ko"></span>' + esc(CL.erreur);
  else if (CL.dirty) el.innerHTML = '<span class="dot warn"></span>Modifications en attente d\'envoi';
  else if (CL.horsLigne) el.innerHTML = '<span class="dot warn"></span>Hors connexion';
  else el.innerHTML = '<span class="dot"></span>Enregistré en ligne' + (CL.derniere ? ' · ' + hm(CL.derniere) : '');
  var em = CL.sess && CL.sess.user ? CL.sess.user.email : '';
  st.innerHTML = esc(em) + (CL.org ? ' (' + esc(ROLES[CL.org.role] || CL.org.role) + ') · ' + (CL.org.essai ? 'Essai' : 'Licence') + ' jusqu\'au ' + fd(CL.org.licence_fin) : '');
}
function deconnexion() {
  function fin() {
    var t = CL.sess && CL.sess.access_token;
    if (t) http('POST', '/auth/v1/logout', {}, t).then(null, function () {});
    var esp = CL.espace; oublierSession(); clearTimeout(CL.tEnvoi);
    (esp && esp.organisations || []).forEach(function (o) { lsSet('rh_org_' + o.id, null); });
    if (esp) lsSet('rh_espace_' + esp.user_id, null);
    CL.org = null; CL.espace = null; CL.dirty = false; CL.version = 0; CL.derniere = null;
    S = etatVierge(''); S.ui = uiDefaut(); location.hash = '';
    ecranConnexion('Vous êtes déconnecté.', 'ok');
  }
  if (CL.dirty) confirmer('Se déconnecter', '<div class="note warn"><pre>Des modifications ne sont pas encore envoyées en ligne' + (CL.horsLigne ? ' (pas de connexion Internet)' : '') + '.\nSi vous vous déconnectez maintenant, elles seront perdues.</pre></div>', 'Se déconnecter quand même', fin, 'dan');
  else fin();
}

// ---------- Utilisateurs de l'entreprise (administrateur) ----------
function gererUtilisateurs() {
  if (!CL.org || !estAdmin()) return alerte('Utilisateurs', 'Réservé à l\'administrateur de l\'entreprise.', 'warn');
  var org = CL.org;
  var v = dialog({ titre: 'Utilisateurs — ' + org.nom, html: '<div id="uZone" class="u-zone">Chargement…</div>', boutons: [{ t: 'Fermer', cls: 'pri' }] });
  $('.modal', v).classList.add('large');
  function charger() {
    rpc('liste_membres', { o: org.id }).then(function (r) {
      var nb = r.membres.length + r.invitations.length;
      $('#uZone', v).innerHTML = '<p style="margin:0 0 8px">Licence : <b>' + nb + ' / ' + r.max + '</b> utilisateur(s).</p><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Adresse e-mail</th><th>Rôle</th><th>État</th><th></th></tr></thead><tbody>' +
        r.membres.map(function (m) {
          return '<tr style="cursor:default"><td>' + esc(m.email) + (m.moi ? ' <i>(vous)</i>' : '') + '</td><td><select data-role="' + esc(m.email) + '">' + Object.keys(ROLES).map(function (k) { return '<option value="' + k + '"' + (k === m.role ? ' selected' : '') + '>' + ROLES[k] + '</option>'; }).join('') + '</select></td><td>Actif</td><td><button class="btn dan sm" type="button" data-del-u="' + esc(m.user_id) + '" data-em="' + esc(m.email) + '">Retirer</button></td></tr>';
        }).join('') +
        r.invitations.map(function (i) {
          return '<tr style="cursor:default"><td>' + esc(i.email) + '</td><td>' + esc(ROLES[i.role]) + '</td><td><i>Invité — doit créer son compte</i></td><td><button class="btn dan sm" type="button" data-del-i="' + esc(i.email) + '">Annuler</button></td></tr>';
        }).join('') + '</tbody></table></div>' +
        '<form class="u-add"><div class="field"><label for="uEm">Ajouter un utilisateur (adresse e-mail)</label><input id="uEm" type="email" placeholder="nom@entreprise.com"></div><div class="field"><label for="uRole">Rôle</label><select id="uRole">' + Object.keys(ROLES).map(function (k) { return '<option value="' + k + '"' + (k === 'gestionnaire' ? ' selected' : '') + '>' + ROLES[k] + '</option>'; }).join('') + '</select></div><button class="btn pri" type="submit" id="uAdd">' + ic('plus') + 'Ajouter</button></form><div class="auth-msg"></div>' +
        '<p class="auth-p">Administrateur : tout, y compris les paramètres, les rubriques et les utilisateurs. Gestionnaire de paie : saisie des salariés et de la paie. Consultation seule : lecture et impression.<br>Si la personne n\'a pas encore de compte, elle le crée avec cette adresse e-mail (« Créer un compte ») et elle est rattachée automatiquement.</p>';
      $('form', v).addEventListener('submit', function (ev) { ev.preventDefault(); });
      $('#uAdd', v).onclick = function () {
        var em = $('#uEm', v).value.trim(); if (!em) return;
        rpc('ajouter_membre', { o: org.id, p_email: em, p_role: $('#uRole', v).value }).then(function (st) {
          toast(st === 'invite' ? 'Invitation enregistrée : ' + em + ' doit créer son compte' : 'Utilisateur ajouté'); charger();
        }, function (e) { authMsg(v, errFr(e)); });
      };
      $$('[data-role]', v).forEach(function (s) { s.onchange = function () { rpc('ajouter_membre', { o: org.id, p_email: s.dataset.role, p_role: s.value }).then(function () { toast('Rôle modifié'); charger(); }, function (e) { authMsg(v, errFr(e)); charger(); }); }; });
      $$('[data-del-u]', v).forEach(function (b) { b.onclick = function () { if (!window.confirm('Retirer ' + b.dataset.em + ' ?')) return; rpc('retirer_membre', { o: org.id, p_user: b.dataset.delU, p_email: null }).then(function () { toast('Utilisateur retiré'); charger(); }, function (e) { authMsg(v, errFr(e)); }); }; });
      $$('[data-del-i]', v).forEach(function (b) { b.onclick = function () { rpc('retirer_membre', { o: org.id, p_user: null, p_email: b.dataset.delI }).then(function () { charger(); }, function (e) { authMsg(v, errFr(e)); }); }; });
    }, function (e) { $('#uZone', v).innerHTML = '<div class="note err"><pre>' + esc(errFr(e)) + '</pre></div>'; });
  }
  charger();
}

// ---------- Historique des sauvegardes (administrateur) ----------
function voirHistorique() {
  if (!CL.org || !estAdmin()) return alerte('Historique', 'Réservé à l\'administrateur de l\'entreprise.', 'warn');
  var org = CL.org;
  var v = dialog({ titre: 'Historique des sauvegardes — ' + org.nom, html: '<div id="hZone">Chargement…</div>', boutons: [{ t: 'Fermer', cls: 'pri' }] });
  $('.modal', v).classList.add('large');
  rpc('historique', { o: org.id }).then(function (l) {
    $('#hZone', v).innerHTML = (l.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Enregistré par</th><th class="num">Salariés</th><th></th></tr></thead><tbody>' + l.map(function (h) {
      var d = new Date(h.cree_le);
      return '<tr style="cursor:default"><td>' + fd(d.toISOString().slice(0, 10)) + ' ' + hm(d) + '</td><td>' + esc(h.par || '') + '</td><td class="num">' + h.salaries + '</td><td><button class="btn sm" type="button" data-h="' + h.id + '">Restaurer</button></td></tr>';
    }).join('') + '</tbody></table></div>' : '<div class="note info"><pre>Aucune sauvegarde pour le moment.</pre></div>') +
      '<p class="auth-p">Une copie des données est gardée chaque jour (au premier enregistrement de la journée), pendant 30 jours. Restaurer remplace les données actuelles ; elles sont elles-mêmes gardées dans l\'historique.</p>';
    $$('[data-h]', v).forEach(function (b) { b.onclick = function () {
      if (!window.confirm('Remplacer les données actuelles par cette sauvegarde ?')) return;
      rpc('restaurer', { o: org.id, p_id: Number(b.dataset.h) }).then(function (r) { v.remove(); appliquer(r.contenu, r.version, false); toast('Sauvegarde restaurée'); }, function (e) { alerte('Restaurer', errFr(e), 'err'); });
    }; });
  }, function (e) { $('#hZone', v).innerHTML = '<div class="note err"><pre>' + esc(errFr(e)) + '</pre></div>'; });
}

// ---------- Console de l'éditeur : licences annuelles ----------
function pEditeur(m) {
  if (!estEditeur()) { location.hash = '#accueil'; return; }
  m.innerHTML = top('Éditeur ' + EDITEUR, 'Console des licences', '<button class="btn" type="button" id="eRef">' + ic('arrow') + 'Actualiser</button><button class="btn pri" type="button" id="eNew">' + ic('plus') + 'Nouvelle licence</button>') +
    '<div class="panel"><div class="tbl-wrap" id="eZone"><div style="padding:14px">Chargement…</div></div></div>' +
    '<p style="font-size:12px;color:var(--muted)">Double-cliquez sur une ligne pour modifier ou renouveler la licence. Les données de paie des clients ne sont pas visibles depuis cette console.</p>';
  var liste = [];
  function statut(o) { return !o.actif ? '<span class="pill sortie">Suspendue</span>' : !o.licence_ok ? '<span class="pill sortie">Expirée</span>' : o.essai ? '<span class="pill cdd">Essai</span>' : '<span class="pill actif">Active</span>'; }
  function charger() {
    rpc('editeur_organisations').then(function (l) {
      liste = l; var t = today();
      $('#eZone', m).innerHTML = '<table class="tbl"><thead><tr><th>Entreprise</th><th>Administrateur(s)</th><th class="num">Utilisateurs</th><th class="num">Salariés</th><th>Début</th><th>Fin</th><th>Statut</th><th>Dernière activité</th><th>Notes</th></tr></thead><tbody>' +
        (l.length ? l.map(function (o) {
          var j = Math.round((new Date(o.licence_fin) - new Date(t)) / 86400000);
          return '<tr data-id="' + esc(o.id) + '"><td><b>' + esc(o.nom) + '</b></td><td>' + esc(o.admins || '') + (o.invitations ? '<br><i style="color:var(--muted)">invité : ' + esc(o.invitations) + '</i>' : '') + '</td><td class="num">' + o.nb_membres + ' / ' + o.max_utilisateurs + '</td><td class="num">' + (o.salaries || 0) + '</td><td>' + fd(o.licence_debut) + '</td><td>' + fd(o.licence_fin) + (o.licence_ok && j <= 30 ? ' <b style="color:var(--amber)">(J-' + j + ')</b>' : '') + '</td><td>' + statut(o) + '</td><td>' + (o.maj_le ? fd(o.maj_le.slice(0, 10)) : '—') + '</td><td>' + esc(o.notes || '') + '</td></tr>';
        }).join('') : '<tr><td colspan="9" style="padding:14px">Aucune licence. Cliquez sur « Nouvelle licence ».</td></tr>') + '</tbody></table>';
      $$('tr[data-id]', m).forEach(function (tr) { tr.ondblclick = function () { formLicence(liste.filter(function (o) { return o.id === tr.dataset.id; })[0]); }; });
    }, function (e) { $('#eZone', m).innerHTML = '<div class="note err" style="margin:12px"><pre>' + esc(errFr(e)) + '</pre></div>'; });
  }
  function plusUnAn(iso) { var p = iso.split('-'); return (Number(p[0]) + 1) + '-' + p[1] + '-' + p[2]; }
  function formLicence(o) {
    var t = today(), nouv = !o, fin0 = o ? o.licence_fin : plusUnAn(t);
    var v = dialog({ titre: nouv ? 'Nouvelle licence' : 'Licence — ' + o.nom, html: '<form class="grid g2" style="gap:10px">' +
      '<div class="field" style="grid-column:1/-1"><label for="lNom">Entreprise cliente</label><input id="lNom" value="' + esc(o ? o.nom : '') + '"></div>' +
      (nouv ? '<div class="field" style="grid-column:1/-1"><label for="lEm">E-mail de l\'administrateur du client</label><input id="lEm" type="email" placeholder="drh@client.com"><span class="hint">S\'il n\'a pas encore de compte, il le crée avec cette adresse et il est rattaché automatiquement.</span></div>' : '') +
      '<div class="field"><label for="lDeb">Début de licence</label><input id="lDeb" type="date" value="' + esc(o ? o.licence_debut : t) + '"></div>' +
      '<div class="field"><label for="lFin">Fin de licence</label><input id="lFin" type="date" value="' + esc(fin0) + '"></div>' +
      '<div class="field"><label for="lMax">Nombre d\'utilisateurs</label><input id="lMax" type="number" min="1" max="100" value="' + (o ? o.max_utilisateurs : 3) + '"></div>' +
      (nouv ? '' : '<div class="field"><label for="lAct">État</label><select id="lAct"><option value="1"' + (o.actif ? ' selected' : '') + '>Active</option><option value="0"' + (o.actif ? '' : ' selected') + '>Suspendue</option></select></div>') +
      '<div class="field" style="grid-column:1/-1"><label for="lNotes">Notes (facture, contact, montant…)</label><input id="lNotes" value="' + esc(o ? o.notes || '' : '') + '"></div>' +
      (nouv ? '' : '<div class="field" style="grid-column:1/-1"><label for="lAdm">Ajouter un administrateur (e-mail)</label><input id="lAdm" type="email" placeholder="facultatif"></div>') +
      '<div class="auth-msg" style="grid-column:1/-1"></div></form>',
      boutons: [{ t: 'Annuler' }].concat(nouv ? [] : [{ t: 'Renouveler 1 an', fn: function (w) { var f = $('#lFin', w); var base = f.value > t ? f.value : t; f.value = plusUnAn(base); $('#lAct', w).value = '1'; return false; } }])
        .concat([{ t: 'Enregistrer', cls: 'pri', fn: function (w) {
          var nom = $('#lNom', w).value.trim(), deb = $('#lDeb', w).value, fin = $('#lFin', w).value, max = Number($('#lMax', w).value) || 1, notes = $('#lNotes', w).value.trim() || null;
          var p = nouv ? rpc('editeur_creer_organisation', { p_nom: nom, p_email_admin: $('#lEm', w).value.trim(), p_debut: deb, p_fin: fin, p_max: max, p_notes: notes })
            : rpc('editeur_maj_organisation', { o: o.id, p_nom: nom, p_debut: deb, p_fin: fin, p_max: max, p_actif: $('#lAct', w).value === '1', p_notes: notes }).then(function () {
              var adm = $('#lAdm', w).value.trim(); return adm ? rpc('editeur_ajouter_admin', { o: o.id, p_email: adm }) : null;
            });
          $$('.mf .btn', w).forEach(function (b) { b.disabled = true; });
          p.then(function (r) { w.remove(); toast(nouv ? (r && r.admin === 'invite' ? 'Licence créée — l\'administrateur doit créer son compte' : 'Licence créée') : 'Licence enregistrée'); charger(); },
            function (e) { $$('.mf .btn', w).forEach(function (b) { b.disabled = false; }); authMsg(w, errFr(e)); });
          return false;
        } }]) });
    $('.modal', v).classList.add('large');
  }
  $('#eNew', m).onclick = function () { formLicence(null); };
  $('#eRef', m).onclick = charger;
  charger();
}

function demarrerCloud() {
  var h = location.hash || '';
  if (/access_token=/.test(h)) {
    var p = {}; h.slice(1).split('&').forEach(function (kv) { var i = kv.indexOf('='); if (i > 0) p[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' ')); });
    history.replaceState(null, '', location.pathname + location.search);
    majSession({ access_token: p.access_token, refresh_token: p.refresh_token, expires_in: p.expires_in, expires_at: Number(p.expires_at) || 0 });
    ecranChargement('Connexion…');
    http('GET', '/auth/v1/user', undefined, p.access_token).then(function (u) {
      CL.sess.user = { id: u.id, email: u.email }; lsSet('rh_session', CL.sess);
      if (p.type === 'recovery') ecranNouveauMdp(); else chargerEspace();
    }, function (e) { oublierSession(); ecranConnexion(errFr(e)); });
    return;
  }
  if (/error_description=/.test(h)) {
    var m = /error_description=([^&]*)/.exec(h);
    history.replaceState(null, '', location.pathname + location.search);
    var d = decodeURIComponent((m && m[1] || '').replace(/\+/g, ' '));
    ecranConnexion(/expired|invalid/i.test(d) ? 'Le lien reçu par e-mail a expiré ou a déjà été utilisé. Recommencez (connexion ou « Mot de passe oublié »).' : d);
    return;
  }
  CL.sess = lsGet('rh_session');
  if (CL.sess && CL.sess.refresh_token) chargerEspace(); else ecranConnexion();
}

// ======================================================================
//  CHROME FAÇON SAGE : menus, barre d'outils, barre d'état
// ======================================================================
function menus() {
  var org = !!CL.org, adm = org && estAdmin();
  var f = [];
  if (org) f.push(['act', 'cloud', 'Synchroniser maintenant', 'sync']);
  if (adm) f.push(['act', 'users', 'Utilisateurs de l\'entreprise…', 'utilisateurs'], ['act', 'hist', 'Historique des sauvegardes…', 'historique']);
  if (CL.espace && ((CL.espace.organisations || []).length > 1 || estEditeur())) f.push(['act', 'arrow', 'Changer d\'entreprise…', 'changer']);
  if (estEditeur()) f.push(['lnk', 'shield', 'Console éditeur (licences)', 'editeur']);
  f.push(['act', 'key', 'Changer mon mot de passe…', 'mdp'], ['act', 'out', 'Se déconnecter', 'deconnexion']);
  if (org) f.push(['hr'], ['act', 'dl', 'Exporter une copie (.json)', 'sauver']);
  if (org && !lectureSeule()) f.push(['act', 'arrow', 'Importer une sauvegarde (.json)', 'restaurer']);
  if (org) f.push(['act', 'dl', 'Exporter le personnel (Excel/CSV)', 'csv'], ['hr'], ['lnk', 'gear', 'Paramètres de la structure', 'parametres'], ['act', 'print', 'Imprimer', 'imprimer']);
  var M = [['Fichier', f]];
  if (org) M.push(
    ['Salariés', [['lnk', 'form', 'Nouveau salarié (Formulaire)', 'formulaire'], ['lnk', 'users', 'Personnels', 'personnels']]],
    ['Paie', [['lnk', 'coins', 'Éléments de salaire', 'elements'], ['lnk', 'clock', 'Heures supplémentaires', 'heures'], ['lnk', 'calc', 'Paramétrage des rubriques', 'rubriques'], ['hr'], ['lnk', 'slip', 'Bulletin de paie', 'bulletin'], ['act', 'print', 'Bulletins de la période…', 'periode']]],
    ['États', [['lnk', 'chart', 'Tableau de bord', 'tableau'], ['lnk', 'doc', 'Attestation de travail', 'attestation'], ['lnk', 'cert', 'Certificat de travail', 'certificat']]]);
  M.push(['?', [['lnk', 'home', 'Page d\'accueil', 'accueil'], ['act', 'doc', 'À propos', 'apropos']]]);
  return M;
}
function outils() {
  if (!CL.org) return estEditeur() ? [['lnk', 'shield', 'Licences', 'editeur'], ['act', 'arrow', 'Entreprises', 'changer'], ['act', 'out', 'Déconnexion', 'deconnexion']] : [];
  return [['lnk', 'home', 'Accueil', 'accueil'], ['sep'], ['lnk', 'form', 'Nouveau', 'formulaire'], ['lnk', 'users', 'Personnels', 'personnels'], ['lnk', 'coins', 'Éléments', 'elements'], ['lnk', 'clock', 'Heures sup', 'heures'], ['sep'],
    ['lnk', 'slip', 'Bulletin', 'bulletin'], ['act', 'print', 'Imprimer', 'imprimer'], ['sep'], ['lnk', 'chart', 'Tableau de bord', 'tableau'], ['lnk', 'doc', 'Attestation', 'attestation'], ['lnk', 'cert', 'Certificat', 'certificat'], ['sep'],
    ['act', 'cloud', 'Synchroniser', 'sync'], ['lnk', 'calc', 'Rubriques', 'rubriques'], ['lnk', 'gear', 'Paramètres', 'parametres']];
}
function action(a) {
  if (a === 'sync') synchroniser(true);
  else if (a === 'utilisateurs') gererUtilisateurs();
  else if (a === 'historique') voirHistorique();
  else if (a === 'changer') { if (CL.dirty) { envoyer(); } choisirEntreprise(true); }
  else if (a === 'mdp') changerMonMdp();
  else if (a === 'deconnexion') deconnexion();
  else if (a === 'sauver') sauvegarder();
  else if (a === 'restaurer') $('#fileRestore').click();
  else if (a === 'csv') exporterCSV();
  else if (a === 'periode') { if (location.hash !== '#bulletin') location.hash = '#bulletin'; setTimeout(bulletinsPeriode, 80); }
  else if (a === 'imprimer') { var b = $('#bPrint') || $('#dPrint'); if (b && !b.disabled) b.click(); else alerte('Imprimer', 'Ouvrez un bulletin de paie, une attestation ou un certificat de travail pour l\'imprimer.', 'info'); }
  else if (a === 'apropos') alerte('À propos', 'Gestion RH & Paie — version 2.0 (en ligne)\nÉdité par ' + EDITEUR + ' — Bamako\nCalculs issus du classeur « Logiciel de gestion RH » (formules d\'origine conservées).' + (CL.org ? '\n\nEntreprise : ' + CL.org.nom + '\n' + (CL.org.essai ? 'Essai' : 'Licence') + ' valable jusqu\'au ' + fd(CL.org.licence_fin) + '\nUtilisateurs autorisés : ' + CL.org.max_utilisateurs : ''), 'info');
}
function construireChrome() {
  $('#menubar').innerHTML = menus().map(function (m, i) {
    return '<div class="mi"><button type="button" data-mi="' + i + '">' + m[0] + '</button><div class="dd">' + m[1].map(function (it) {
      if (it[0] === 'hr') return '<hr>';
      if (it[0] === 'lnk') return '<a href="#' + it[3] + '">' + ic(it[1]) + it[2] + '</a>';
      return '<button type="button" data-act="' + it[3] + '">' + ic(it[1]) + it[2] + '</button>';
    }).join('') + '</div></div>';
  }).join('');
  $('#toolbar').innerHTML = outils().map(function (t) {
    if (t[0] === 'sep') return '<span class="tsep"></span>';
    if (t[0] === 'lnk') return '<a class="tbtn" href="#' + t[3] + '" title="' + t[2] + '">' + ic(t[1]) + t[2] + '</a>';
    return '<button class="tbtn" type="button" data-act="' + t[3] + '" title="' + t[2] + '">' + ic(t[1]) + t[2] + '</button>';
  }).join('');
  var ouvert = false;
  $$('.mi>button').forEach(function (b) {
    b.onclick = function (ev) { ev.stopPropagation(); var mi = b.parentNode, etait = mi.classList.contains('open'); $$('.mi').forEach(function (x) { x.classList.remove('open'); }); if (!etait) mi.classList.add('open'); ouvert = !etait; };
    b.onmouseenter = function () { if (ouvert) { $$('.mi').forEach(function (x) { x.classList.remove('open'); }); b.parentNode.classList.add('open'); } };
  });
  if (!construireChrome.fait) { construireChrome.fait = true; document.addEventListener('click', function () { $$('.mi').forEach(function (x) { x.classList.remove('open'); }); ouvert = false; }); }
  $$('#menubar [data-act], #toolbar [data-act]').forEach(function (b) { b.onclick = function (ev) { ev.stopPropagation(); $$('.mi').forEach(function (x) { x.classList.remove('open'); }); ouvert = false; action(b.dataset.act); }; });
  $$('.dd a').forEach(function (a) { a.addEventListener('click', function () { $$('.mi').forEach(function (x) { x.classList.remove('open'); }); ouvert = false; }); });
}
function majChrome(id) {
  var p = PAGES.filter(function (x) { return x.id === id; })[0];
  $$('.tbtn[href]').forEach(function (t) { t.classList.toggle('on', t.getAttribute('href') === '#' + id); });
  $('#tbTitle').textContent = 'Gestion RH & Paie — ' + S.P.nom + (p ? ' — [' + p.t + ']' : '');
  var R = rows(), actifs = R.filter(function (x) { return x.r.statut === 'Actif'; }).length;
  var sb = $('#statusbar'), st = $('#saveState');
  $$('#statusbar > span:not(#saveState):not(#autoState)').forEach(function (x) { x.remove(); });
  var parts = ['Société : <b>' + esc(S.P.nom) + '</b>', 'Période de paie : du ' + fd(S.periode.debut) + ' au ' + fd(S.periode.fin), 'Salariés actifs : ' + actifs + ' / ' + R.length, 'Date : ' + fd(today())];
  var ref = $('#autoState') || st; parts.forEach(function (h) { var sp = document.createElement('span'); sp.innerHTML = h; sb.insertBefore(sp, ref); });
}
construireChrome();
$('#fileRestore').onchange = function () {
  var f = this.files[0]; if (!f) return; var inp = this;
  var rd = new FileReader();
  rd.onload = function () {
    try {
      var o = JSON.parse(rd.result);
      if (!o || !Array.isArray(o.emps) || !o.P) throw new Error('format');
      confirmer('Restaurer une sauvegarde', '<p style="margin:0">Remplacer les données actuelles par la sauvegarde « ' + esc(f.name) + ' » (' + o.emps.length + ' salariés) ?</p>', 'Restaurer', function () {
        S = o; S.ui = S.ui || etatInitial().ui; S.ret = S.ret || {}; S.periode = S.periode || etatInitial().periode; save(); route(); toast('Sauvegarde restaurée');
      });
    } catch (err) { alerte('Restaurer', 'Ce fichier n\'est pas une sauvegarde de l\'application (fichier .json créé par le bouton « Sauvegarder les données »).', 'err'); }
    inp.value = '';
  };
  rd.readAsText(f);
};

// Démarrage
S = etatVierge(''); S.ui = uiDefaut();
initListes();
appliquerTheme();
demarrerCloud();
})();
