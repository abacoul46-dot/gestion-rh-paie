/* ==========================================================================
   MOTEUR DE CALCUL RH — reprise fidèle des formules du classeur
   « Logiciel de gestion RH copie.xlsm » (Tableau1, Bulletin de Paie,
   Calcul des Heures Supp, Données / Tableau de Bord, macros VBA)
   et de « CALCUL ITS 2016.xlsx ».
   Chaque fonction cite la cellule Excel qu'elle reproduit.
   ========================================================================== */
var RH = (function () {
  'use strict';

  // ---------- Outils « à la manière d'Excel » ----------
  function blank(v) { return v === null || v === undefined || v === ''; }
  // Conversion numérique comme les opérateurs + - * d'Excel ("000" -> 0, vide -> 0)
  function N(v) {
    if (blank(v) || v === false) return 0;
    if (v === true) return 1;
    if (typeof v === 'number') return v;
    var n = Number(String(v).replace(/\s/g, '').replace(',', '.'));
    return isNaN(n) ? 0 : n;
  }
  // ROUND d'Excel : arrondi « au plus loin de zéro »
  function ROUND(x, d) {
    var m = Math.pow(10, d || 0);
    var y = Math.abs(x) * m;
    var r = Math.floor(y + 0.5 + 1e-9);
    return Math.sign(x) * r / m;
  }
  // ROUNDDOWN d'Excel (vers zéro). d peut être négatif (-3 = au millier)
  function ROUNDDOWN(x, d) {
    var m = Math.pow(10, d || 0);
    var y = Math.abs(x) * m;
    return Math.sign(x) * Math.floor(y + 1e-9) / m;
  }
  function FLOOR(x, s) { return Math.floor(x / s + 1e-12) * s; }
  function CEILING(x, s) { return Math.ceil(x / s - 1e-12) * s; }

  // ---------- Dates (chaînes AAAA-MM-JJ, sans fuseau horaire) ----------
  function parseD(s) {
    if (blank(s)) return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
    if (!m) return null;
    return { y: +m[1], m: +m[2], d: +m[3] };
  }
  function serial(s) { // numéro de série façon Excel, pour comparer
    var p = parseD(s); if (!p) return null;
    return Math.round((Date.UTC(p.y, p.m - 1, p.d) - Date.UTC(1899, 11, 30)) / 86400000);
  }
  function todayISO() {
    var t = new Date();
    return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
  }
  // DATEDIF(debut, fin, "Y")
  function DATEDIF_Y(a, b) {
    var p = parseD(a) || { y: 1899, m: 12, d: 30 }, q = parseD(b);
    var y = q.y - p.y;
    if (q.m < p.m || (q.m === p.m && q.d < p.d)) y--;
    return y;
  }
  var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  // Q15/Q16/Q17/Q18 de l'attestation : « 1er janvier 2000 »
  function dateLettres(s) {
    var p = parseD(s); if (!p) return '';
    return p.d + (p.d === 1 ? 'er' : '') + ' ' + MOIS[p.m - 1] + ' ' + p.y;
  }

  // ---------- Paramètres par défaut (feuille Paramètres) ----------
  var PARAM_DEFAUT = {
    nom: 'ABA GROUP', adresse: 'Hamdallaye', tel: '72210216', email: 'abagroupmali@gmail.com',
    mention: 'CCCF', ville: 'Bamako', fonctionSign: 'Directeur Général', nomSign: 'Hassa Abraham COULIBALY',
    logo: '',
    tauxInpsSal: 0.036,   // C23
    tauxInpsEmp: 0.18,    // C24
    ca: 350000000,        // C25
    hs1: 0.1, hs2: 0.25, hs3: 0.5, hs4: 1, // C26:C29
    ages: [[0, 24, '<25'], [25, 34, '25-34'], [35, 44, '35-44'], [45, 54, '45-54'], [55, null, '55+']],
    salaires: [[0, 249000, '<250000'], [250000, 499000, '250000 - 499000'], [500000, 749000, '500000 - 749000'],
      [750000, 999000, '750000 - 999000'], [1000000, 1499000, '1000000 - 1499000'], [1500000, null, '1500000 +']]
  };
  var SEUIL_CA = 250000000; // Personnels!AW4

  // VLOOKUP(valeur, table, 3, TRUE)
  function vlookupApprox(v, table) {
    var res = null;
    for (var i = 0; i < table.length; i++) { if (N(table[i][0]) <= v) res = table[i][2]; else break; }
    return res === null ? '#N/A' : res;
  }

  // ======================================================================
  //  LIGNE DU TABLEAU PERSONNELS (Tableau1, colonnes S à BH)
  // ======================================================================
  function calcLigne(e, P, today) {
    today = today || todayISO();
    var stage = e.contrat === 'STAGE';
    var r = {};
    // S  Ancienneté (ans)
    r.anc = blank(e.entree) ? '' : DATEDIF_Y(e.entree, today);
    // T  Taux ancienneté
    var a = r.anc;
    if (a === '') r.tauxAnc = false;
    else if (a <= 4) r.tauxAnc = 0; else if (a === 5) r.tauxAnc = 0.03; else if (a === 6) r.tauxAnc = 0.05;
    else if (a === 7) r.tauxAnc = 0.06; else if (a === 8) r.tauxAnc = 0.07; else if (a === 9) r.tauxAnc = 0.08;
    else if (a === 10) r.tauxAnc = 0.09; else if (a === 11) r.tauxAnc = 0.1; else if (a === 12) r.tauxAnc = 0.11;
    else if (a === 13) r.tauxAnc = 0.12; else if (a === 14) r.tauxAnc = 0.13; else if (a === 15) r.tauxAnc = 0.14;
    else if (a <= 65) r.tauxAnc = 0.15; else r.tauxAnc = false;
    var U = e.base;
    // V  Indemnité spéciale 1973
    r.isp73 = stage ? '000' : (blank(U) ? '' : (N(U) > 1 ? 1000 : false));
    // W  Cherté de vie 1974
    r.icv74 = stage ? '000' : N(U) * 0.10;
    // X  Solidarité 1991
    r.isol91 = stage ? '000' : (e.cat === 'A' ? 2000 : e.cat === 'B' ? 5000 : e.cat === 'C' ? 6000 : false);
    // Y  Prime d'ancienneté
    r.panc = N(U) * N(r.tauxAnc);
    // AJ Salaire brut
    r.brut = N(U) + N(r.isp73) + N(r.icv74) + N(r.isol91) + N(r.panc) + N(e.transport) + N(e.caisse) + N(e.monture) +
      N(e.resp) + N(e.avn) + N(e.hs10) + N(e.hs25) + N(e.hs50) + N(e.hs100) + N(e.sursal);
    // AK Base cotisable
    r.baseCot = stage ? '' : r.brut - (N(e.transport) + N(e.caisse) + N(e.monture));
    // AL INPS, AM AMO, AO INPS2, AP AMO2
    r.inps = stage ? '' : N(r.baseCot) * P.tauxInpsSal;
    r.amo = stage ? '' : N(r.baseCot) * 0.0306;
    r.inps2 = stage ? '' : N(r.baseCot) * P.tauxInpsEmp;
    r.amo2 = stage ? '' : N(r.baseCot) * 0.035;
    // AZ Base CF TL
    r.baseCFTL = stage ? '000' : FLOOR(r.brut, 250);
    // AQ CF, AR TL
    r.cf = stage ? '' : N(r.baseCFTL) * 0.035;
    r.tl = stage ? '' : N(r.baseCFTL) * 0.01;
    // AS Salaire de base 10 %
    r.b10 = stage ? '' : N(U) * 0.10;
    // AT / AU / AV : parts exonérées transport, caisse, monture (plafond 10 % du base)
    function plafond(x, gardeStage) {
      if (gardeStage && stage) return '';
      if (blank(x)) return '000';
      if (r.b10 === '') return x;           // nombre < texte dans Excel
      return N(x) < r.b10 ? x : r.b10;
    }
    r.itsT = plafond(e.transport, true);
    r.itsC = plafond(e.caisse, false);
    r.itsM = plafond(e.monture, false);
    // AW Responsabilité exonérée
    r.respS = blank(e.resp) ? '000' : (N(P.ca) < SEUIL_CA ? 60000 : 80000);
    // AX Avantage en nature exonéré (50 %)
    r.avnS = blank(e.avn) ? '000' : N(e.avn) / 2;
    // AY Base imposable
    r.baseImp = stage ? '' : r.brut - (N(r.inps) + N(r.isol91) + N(r.itsT) + N(r.itsC) + N(r.itsM) + N(r.respS) + N(r.avnS));
    // BA Âge
    r.age = DATEDIF_Y(e.naissance, today);
    // BD Statut
    r.statut = (blank(e.sortie) || serial(e.sortie) > serial(today)) ? 'Actif' : 'Sortie';
    // BH Masse salariale
    r.masse = stage ? '' : r.brut + N(r.inps2) + N(r.amo2) + N(r.cf) + N(r.tl);
    // BE Tranche S
    r.trancheS = stage ? r.brut : CEILING(N(r.masse), 25000);
    // BF Tranche salaire, BG Tranche âge
    r.trancheSal = r.statut === 'Actif' ? vlookupApprox(N(r.trancheS), P.salaires) : '<250000';
    r.trancheAge = r.statut === 'Actif' ? vlookupApprox(r.age, P.ages) : '';
    appliquerRubriques(e, r, P, stage);
    return r;
  }

  // ======================================================================
  //  RUBRIQUES PARAMÉTRÉES PAR L'UTILISATEUR (ajout, sans toucher aux
  //  formules d'origine : sans rubrique, les résultats sont identiques)
  // ======================================================================
  function valeurRubrique(rb, e) {
    if (rb.mode === 'fixe') return N(rb.valeur);
    if (rb.mode === 'taux') return N(e.base) * N(rb.valeur) / 100;
    return N(e.rub && e.rub[rb.code]);
  }
  function appliquerRubriques(e, r, P, stage) {
    r.rubGains = []; r.rubRet = [];
    var rubs = (P.rubriques || []).filter(function (x) { return x.actif !== false; });
    if (!rubs.length) return;
    var G = 0, Gc = 0, Gi = 0;
    rubs.forEach(function (rb) {
      var v = valeurRubrique(rb, e);
      if (!v) return;
      var l = { code: rb.code, lib: rb.lib, v: v, taux: rb.mode === 'taux' ? N(rb.valeur) / 100 : '', base: rb.mode === 'taux' ? N(e.base) : v };
      if (rb.type === 'retenue') { r.rubRet.push(l); return; }
      r.rubGains.push(l); G += v; if (rb.cot) Gc += v; if (rb.its) Gi += v;
    });
    if (!G) return;
    r.brut += G;
    if (stage) { r.trancheS = r.brut; }
    else {
      r.baseCot = N(r.baseCot) + Gc;
      r.inps = r.baseCot * P.tauxInpsSal; r.amo = r.baseCot * 0.0306;
      r.inps2 = r.baseCot * P.tauxInpsEmp; r.amo2 = r.baseCot * 0.035;
      r.baseCFTL = FLOOR(r.brut, 250); r.cf = r.baseCFTL * 0.035; r.tl = r.baseCFTL * 0.01;
      r.baseImp = r.brut - (N(r.inps) + N(r.isol91) + N(r.itsT) + N(r.itsC) + N(r.itsM) + N(r.respS) + N(r.avnS)) - (G - Gi);
      r.masse = r.brut + r.inps2 + r.amo2 + r.cf + r.tl;
      r.trancheS = CEILING(r.masse, 25000);
    }
    r.trancheSal = r.statut === 'Actif' ? vlookupApprox(N(r.trancheS), P.salaires) : '<250000';
  }

  // ======================================================================
  //  BULLETIN DE PAIE (feuille Bulletin de Paie, C3:J58 + calcul ITS P42:Q65)
  // ======================================================================
  var DIV0 = '#DIV/0!';
  function tranchesITS(q) { // Q45:Q56 (seuils exactement comme dans le classeur)
    return [
      q > 0 ? (q > 330000 ? 0 : (q - 0) * 0) : 0,
      q > 330001 ? (q > 578400 ? 12420 : (q - 330001) * 0.05) : 0,
      q > 578401 ? (q > 1176400 ? 71760 : (q - 578401) * 0.12) : 0,
      q > 1176401 ? (q > 1789733 ? 110400 : (q - 1176401) * 0.18) : 0,
      q > 1789734 ? (q > 2384195 ? 154560 : (q - 1789734) * 0.26) : 0,
      q > 2384196 ? (q > 3494130 ? 344080 : (q - 2384196) * 0.31) : 0,
      q > 3494130 ? (q - 3494130) * 0.37 : 0
    ];
  }
  function calcITS(baseImp, situation, enfants) {
    var o = {};
    o.q42 = blank(baseImp) ? 0 : FLOOR(N(baseImp), 250);           // D42 / Q42
    o.q44 = ROUNDDOWN(o.q42 * 12, -3);                              // Q44
    o.tranches = tranchesITS(o.q44);
    o.q57 = o.tranches.reduce(function (s, x) { return s + x; }, 0); // ITS annuel brut
    var nb = N(enfants);
    o.q60 = (String(situation || '').slice(0, 5) === 'Marié' ? 0.10 : 0) + (nb > 0 ? (nb <= 10 ? 0.025 * nb : 0.25) : 0);
    o.q61 = o.q57 - (o.q57 * o.q60);                                 // ITS annuel net
    if (o.q44 === 0) { o.q62 = DIV0; o.q63 = DIV0; o.q64 = DIV0; o.q65 = DIV0; return o; }
    o.q62 = o.q61 / o.q44;                                           // % ITS net
    o.q63 = o.q62 - 0.02;                                            // moins 2 points
    if (o.q62 === 0) { o.q64 = DIV0; o.q65 = DIV0; return o; }
    o.q64 = ROUNDDOWN((o.q63 / o.q62) * o.q61, 0);                   // nouvel ITS annuel net
    o.q65 = o.q64 / 12;                                              // ITS mensuel
    return o;
  }
  function err(v) { return v === DIV0; }
  function addX() { // addition qui propage #DIV/0! comme Excel
    var s = 0;
    for (var i = 0; i < arguments.length; i++) { if (err(arguments[i])) return DIV0; s += N(arguments[i]); }
    return s;
  }

  function bulletin(e, r, P, ret) {
    ret = ret || {};
    var stagiaire = e.poste === 'Stagiaire';  // test G7="Stagiaire" du bulletin
    var b = { e: e, r: r };
    b.lignes = [
      { lib: 'Salaire de Base', nb: 1, base: e.base, taux: '', gain: N(e.base) },
      { lib: 'Indemnité spéciale 1973', nb: 1, base: r.isp73, taux: '', gain: N(r.isp73) },
      { lib: 'Indemnité de cherté de vie 1974', nb: '', base: e.base, taux: 0.1, gain: N(r.icv74) },
      { lib: 'Indemnité de solidarité 1991', nb: 1, base: r.isol91, taux: '', gain: N(r.isol91) },
      { lib: "Prime d'ancienneté", nb: '', base: e.base, taux: N(r.tauxAnc), gain: N(e.base) * N(r.tauxAnc) },
      { lib: 'Indemnité de Transport', nb: 1, base: e.transport, taux: '', gain: N(e.transport) },
      { lib: 'Indemnité de Caisse', nb: 1, base: e.caisse, taux: '', gain: N(e.caisse) },
      { lib: 'Indemnité de Monture', nb: 1, base: e.monture, taux: '', gain: N(e.monture) },
      { lib: 'Indemnité de Responsabilité', nb: 1, base: e.resp, taux: '', gain: N(e.resp) },
      { lib: 'Avantage en nature', nb: 1, base: e.avn, taux: '', gain: N(e.avn) },
      { lib: 'Heures supplémentaires ' + pct0(P.hs1), nb: 1, base: e.hs10, taux: '', gain: N(e.hs10) },
      { lib: 'Heures supplémentaires ' + pct0(P.hs2), nb: 1, base: e.hs25, taux: '', gain: N(e.hs25) },
      { lib: 'Heures supplémentaires ' + pct0(P.hs3), nb: 1, base: e.hs50, taux: '', gain: N(e.hs50) },
      { lib: 'Heures supplémentaires ' + pct0(P.hs4), nb: 1, base: e.hs100, taux: '', gain: N(e.hs100) },
      { lib: 'Sursalaire', nb: 1, base: e.sursal, taux: '', gain: N(e.sursal) }
    ];
    (r.rubGains || []).forEach(function (g) { b.lignes.push({ lib: g.lib, nb: 1, base: g.base, taux: g.taux, gain: g.v, rub: true }); });
    b.rubRet = r.rubRet || [];
    b.totRubRet = b.rubRet.reduce(function (s, x) { return s + x.v; }, 0);
    b.brut = r.brut;                                         // G38
    b.inps = { base: r.baseCot, ts: P.tauxInpsSal, rs: stagiaire ? 0 : N(r.inps), tp: P.tauxInpsEmp, rp: stagiaire ? 0 : N(r.inps2) };
    b.amo = { base: r.baseCot, ts: 0.0306, rs: stagiaire ? 0 : N(r.amo), tp: 0.035, rp: stagiaire ? 0 : N(r.amo2) };
    b.its = calcITS(r.baseImp, e.situation, e.enfants);
    b.its.base = r.baseImp;                                  // E42
    b.its.rs = stagiaire ? 0 : b.its.q65;                    // H42
    b.cf = { base: r.baseCFTL, tp: 0.035, rp: stagiaire ? 0 : N(r.cf) };
    b.tl = { base: r.baseCFTL, tp: 0.01, rp: stagiaire ? 0 : N(r.tl) };
    b.totSal = addX(b.inps.rs, b.amo.rs, b.its.rs);          // H46
    b.totPat = b.inps.rp + b.amo.rp + b.cf.rp + b.tl.rp;     // J46
    b.retenue = N(ret.retenue);                              // H48
    b.pret = N(ret.pret);                                    // H49
    var deduc = addX(b.totSal, b.retenue, b.pret, b.totRubRet);
    b.net = err(deduc) ? DIV0 : ROUND(b.brut - deduc, 0);    // J55
    b.erreur = err(b.net);
    return b;
  }
  function pct0(x) { return Math.round(x * 100) + '%'; }

  // ======================================================================
  //  CALCUL DES HEURES SUPP
  // ======================================================================
  function heuresSup(e, grille, P) {
    var o = {};
    o.respHS = N(e.resp);                                    // nom défini RespHS
    o.base = N(e.base);                                      // D4
    o.tauxH = o.base / 173.33;                               // D5
    o.taux = [1 + P.hs1, 1 + P.hs2, 1 + P.hs3, 1 + P.hs4];   // D18:G18
    o.heures = [0, 1, 2, 3].map(function (k) {               // D13:G13
      var s = 0; for (var w = 0; w < 5; w++) s += N(grille[w] && grille[w][k]); return s;
    });
    o.montants = o.heures.map(function (h, k) { return o.respHS > 0 ? 0 : o.tauxH * o.taux[k] * h; }); // D20:G20
    return o;
  }

  // ======================================================================
  //  CALCUL À L'ENVERS (module CalculEnvers) : sursalaire pour un net donné
  // ======================================================================
  function netSans(e, P, ret, today, s) {
    var c = Object.assign({}, e, { hs10: '', hs25: '', hs50: '', hs100: '', sursal: s === 0 ? '' : s });
    var b = bulletin(c, calcLigne(c, P, today), P, ret);
    if (b.erreur) return { net: -1, brut: b.brut };
    return { net: N(b.net) + b.retenue + b.pret + b.totRubRet, brut: b.brut };
  }
  function chercherSursalaire(e, P, ret, today, cible) {
    var n0 = netSans(e, P, ret, today, 0);
    if (n0.net >= cible) return { ok: false, net: n0.net };
    var bas = 0, hi = cible, essais = 0;
    while (netSans(e, P, ret, today, hi).net < cible && essais < 20) { bas = hi; hi = hi * 2; essais++; }
    while (hi - bas > 1) {
      var mi = Math.floor((bas + hi) / 2);
      if (netSans(e, P, ret, today, mi).net >= cible) hi = mi; else bas = mi;
    }
    var f = netSans(e, P, ret, today, hi);
    return { ok: true, sursalaire: hi, net: f.net, brut: f.brut };
  }

  // ======================================================================
  //  MATRICULE SUIVANT (Validation!S2)
  // ======================================================================
  function prochainMatricule(liste) {
    var t = liste.filter(function (m) { return !blank(m); });
    var f = t[0] || '';
    var p = f === '' ? 'AB' : String(f).slice(0, String(f).length - 3);
    var mx = 0;
    t.forEach(function (m) { var n = Number(String(m).slice(-3)); if (!isNaN(n) && n > mx) mx = n; });
    return p + String(mx + 1).padStart(3, '0');
  }

  // ======================================================================
  //  RECHERCHE (module Recherche, FiltrerPersonnels)
  // ======================================================================
  function sansAccent(s) {
    var a = 'àâäçèéêëîïôöùûü', b = 'aaaceeeeiioouuu';
    return s.replace(/[àâäçèéêëîïôöùûü]/g, function (c) { return b[a.indexOf(c)]; });
  }
  function correspond(e, crit) {
    crit = sansAccent(String(crit || '').toLowerCase().trim().replace(/\s+/g, ' '));
    if (crit === '') return true;
    if (blank(e.mat)) return false;
    var genre = sansAccent(String(e.genre || '').toLowerCase().trim());
    var texte = '|' + sansAccent((String(e.prenom || '') + '|' + String(e.nom || '') + '|' + String(e.dept || '') + '|' + String(e.contrat || '')).toLowerCase()) + '|';
    return crit.split(' ').every(function (mot) {
      if (mot === 'homme' || mot === 'hommes') mot = 'h';
      if (mot === 'femme' || mot === 'femmes') mot = 'f';
      if (mot.length === 1) return genre === mot;
      return texte.indexOf(mot) >= 0;
    });
  }

  // ======================================================================
  //  TABLEAU DE BORD (feuille Données : tableaux croisés + turnover)
  // ======================================================================
  function tableauDeBord(rows, P, today, filtres) {
    filtres = filtres || {};
    var y = Number(today.slice(0, 4));                       // Période = YEAR(TODAY())
    var actifs = rows.filter(function (x) { return x.r.statut === 'Actif' && !blank(x.e.mat); });
    function moy(arr) { var v = arr.filter(function (x) { return typeof x === 'number'; }); return v.length ? v.reduce(function (s, x) { return s + x; }, 0) / v.length : 0; }
    function somme(arr) { return arr.reduce(function (s, x) { return s + (typeof x === 'number' ? x : 0); }, 0); }
    var o = {};
    // TCD1 (segment « Nature du contrat ») : effectif, somme brut, âge moyen
    var t1 = actifs.filter(function (x) { return !filtres.contrat || x.e.contrat === filtres.contrat; });
    o.effectif = t1.length;
    o.sommeBrut = somme(t1.map(function (x) { return x.r.brut; }));
    o.ageMoyen = moy(t1.map(function (x) { return x.r.age; }));
    // TCD2 : moyennes
    o.moyBrut = moy(actifs.map(function (x) { return x.r.brut; }));
    o.salaireMoyen = moy(actifs.map(function (x) { return x.r.masse; }));
    o.ancMoyenne = moy(actifs.map(function (x) { return x.r.anc; }));
    // TCD14 : somme masse salariale
    o.masse = somme(actifs.map(function (x) { return x.r.masse; }));
    // TCD8 : effectif par genre
    o.genre = { F: actifs.filter(function (x) { return x.e.genre === 'F'; }).length, H: actifs.filter(function (x) { return x.e.genre === 'H'; }).length };
    // TCD3 : départements x genre
    var deps = uniq(actifs.map(function (x) { return x.e.dept; })).sort(cmpTxt);
    o.depGenre = deps.map(function (d) {
      return { dept: d, F: actifs.filter(function (x) { return x.e.dept === d && x.e.genre === 'F'; }).length, H: actifs.filter(function (x) { return x.e.dept === d && x.e.genre === 'H'; }).length };
    });
    // TCD5 : répartition par contrat
    o.contrats = uniq(actifs.map(function (x) { return x.e.contrat; })).sort(cmpTxt).map(function (c) {
      return { contrat: c, n: actifs.filter(function (x) { return x.e.contrat === c; }).length };
    });
    // TCD6 : masse salariale par département (tri croissant)
    o.masseDep = deps.map(function (d) {
      return { dept: d, v: somme(actifs.filter(function (x) { return x.e.dept === d; }).map(function (x) { return x.r.masse; })) };
    }).sort(function (a, b) { return a.v - b.v; });
    // TCD7 et TCD10 (segment « Département ») : pyramide des âges, tranches de salaire
    var t7 = actifs.filter(function (x) { return !filtres.dept || x.e.dept === filtres.dept; });
    o.pyramide = P.ages.map(function (a) { return a[2]; }).map(function (lab) {
      return { lab: lab, F: t7.filter(function (x) { return x.r.trancheAge === lab && x.e.genre === 'F'; }).length, H: t7.filter(function (x) { return x.r.trancheAge === lab && x.e.genre === 'H'; }).length };
    }).filter(function (l) { return l.F + l.H > 0; });
    o.tranchesSal = P.salaires.map(function (a) { return a[2]; }).map(function (lab) {
      return { lab: lab, F: t7.filter(function (x) { return x.r.trancheSal === lab && x.e.genre === 'F'; }).length, H: t7.filter(function (x) { return x.r.trancheSal === lab && x.e.genre === 'H'; }).length };
    }).filter(function (l) { return l.F + l.H > 0; });
    // Turnover (Données!B9:B16), hors STAGE
    var d1 = serial(y + '-01-01'), d31 = serial(y + '-12-31');
    var ns = rows.filter(function (x) { return x.e.contrat !== 'STAGE'; });
    function sv(s) { return serial(s); }
    o.departs = ns.filter(function (x) { var s = sv(x.e.sortie); return s !== null && s >= d1 && s <= d31; }).length;
    var b10 = ns.filter(function (x) { var en = sv(x.e.entree), s = sv(x.e.sortie); return en !== null && en <= d1 && s !== null && s >= d1; }).length;
    var b11 = ns.filter(function (x) { var en = sv(x.e.entree); return en !== null && en <= d1 && blank(x.e.sortie); }).length;
    var b13 = ns.filter(function (x) { var en = sv(x.e.entree), s = sv(x.e.sortie); return en !== null && en <= d31 && s !== null && s > d31; }).length;
    var b14 = ns.filter(function (x) { var en = sv(x.e.entree); return en !== null && en <= d31 && blank(x.e.sortie); }).length;
    o.eff01 = b10 + b11; o.eff31 = b13 + b14;
    var den = (o.eff01 + o.eff31) / 2;
    o.turnover = den ? o.departs / den : 0;
    o.annee = y;
    // Prochains contrats à échéance (Tableau de Bord!Y10)
    var t = serial(today);
    o.echeances = actifs.filter(function (x) { return !blank(x.e.fin) && serial(x.e.fin) >= t; })
      .sort(function (a, b) { return serial(a.e.fin) - serial(b.e.fin); }).slice(0, 5);
    return o;
  }
  function uniq(a) { return a.filter(function (x, i) { return !blank(x) && a.indexOf(x) === i; }); }
  function cmpTxt(a, b) { return String(a).localeCompare(String(b), 'fr'); }

  // Bulletin à éditer pour la période (Departs.PresentSurPeriode)
  function presentSurPeriode(e, debut, fin) {
    if (!blank(e.sortie) && serial(e.sortie) < serial(debut)) return false;
    if (!blank(e.entree) && serial(e.entree) > serial(fin)) return false;
    return true;
  }

  // ======================================================================
  //  CALCUL ITS 2016 (classeur « CALCUL ITS 2016.xlsx »)
  // ======================================================================
  function its2016(brutMensuel, marie, enfants) {
    var F = [330000, 578400, 1176400, 1789733, 2384195, 3494130], G = [0, 0.05, 0.12, 0.18, 0.26, 0.31, 0.37];
    var H = [0, (F[1] - F[0]) * G[1], (F[2] - F[1]) * G[2], (F[3] - F[2]) * G[3], (F[4] - F[3]) * G[4], (F[5] - F[4]) * G[5]];
    var I = [0]; for (var k = 1; k < 6; k++) I[k] = I[k - 1] + H[k];
    var o = { bareme: [] };
    var bornesInf = [0, F[0] + 1, F[1] + 1, F[2] + 1, F[3] + 1, F[4] + 1, F[5]];
    for (var j = 0; j < 7; j++) o.bareme.push({ de: bornesInf[j], a: j < 6 ? F[j] : null, taux: G[j], its: j < 6 ? H[j] : null, cumul: j < 6 ? I[j] : null });
    o.c10 = FLOOR(N(brutMensuel), 250);
    o.c11 = o.c10 * 12;
    var c = o.c11;
    o.c12 = c <= F[0] ? 0 : c <= F[1] ? (c - F[0]) * G[1] : c <= F[2] ? (c - F[1]) * G[2] + I[1] : c <= F[3] ? (c - F[2]) * G[3] + I[2] :
      c <= F[4] ? (c - F[3]) * G[4] + I[3] : c <= F[5] ? (c - F[4]) * G[5] + I[4] : (c - F[5]) * G[6] + I[5];
    o.c13 = marie ? 0.1 : 0;
    o.c14 = N(enfants) <= 10 ? N(enfants) * 0.025 : 0.25;
    o.c15 = o.c13 + o.c14;
    o.c16 = o.c12 - o.c12 * o.c15;
    o.c17 = o.c11 ? o.c16 / o.c11 : DIV0;
    o.c18 = err(o.c17) ? DIV0 : o.c17 - 0.02;
    o.c19 = err(o.c18) ? DIV0 : o.c11 * o.c18;
    o.c20 = err(o.c19) ? DIV0 : o.c19 / 12;
    return o;
  }

  return {
    N: N, blank: blank, ROUND: ROUND, ROUNDDOWN: ROUNDDOWN, FLOOR: FLOOR, serial: serial, parseD: parseD,
    todayISO: todayISO, dateLettres: dateLettres, DATEDIF_Y: DATEDIF_Y, PARAM_DEFAUT: PARAM_DEFAUT, DIV0: DIV0,
    calcLigne: calcLigne, bulletin: bulletin, calcITS: calcITS, heuresSup: heuresSup, chercherSursalaire: chercherSursalaire,
    prochainMatricule: prochainMatricule, correspond: correspond, tableauDeBord: tableauDeBord,
    presentSurPeriode: presentSurPeriode, its2016: its2016, MOIS: MOIS
  };
})();
if (typeof module !== 'undefined') module.exports = RH;
