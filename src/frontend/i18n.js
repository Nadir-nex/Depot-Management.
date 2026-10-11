'use strict';
/* Depot i18n — one authoritative translation system (browser + test compatible).
 * No imports, no storage, no network. Loaded before app.js; app.js uses I18N.
 * Tests load this file in a sandbox to check parity, placeholders and mapping.
 */
(function (root) {
  var SUPPORTED = ['ar', 'fr'];
  var LOCALES = { ar: 'ar-DZ', fr: 'fr-DZ' };

  var STR = {
    fr: {
      appName: 'Dépôt', dashboard: 'Tableau de bord', sales: 'Ventes', purchases: 'Achats',
      articles: 'Articles', stock: 'Stock', parties: 'Tiers', cash: 'Caisse & Charges',
      counts: 'Inventaire', routes: 'Distribution', reports: 'Rapports', settings: 'Paramètres',
      grpMain: 'Principal', grpTrade: 'Commerce', grpStock: 'Stock', grpMoney: 'Finances', grpOps: 'Opérations',
      searchPh: 'Rechercher… (ex : sucre 1kg)', searchLabel: 'Recherche', subtitleDash: 'Aperçu réel depuis la base de données',
      kpiStock: 'Références en stock', kpiLow: 'Stock faible', kpiDocs: 'Documents vente', kpiRoutes: 'Tournées actives',
      kpiCash: 'Caisses', kpiParties: 'Tiers', recentSales: 'Derniers documents vente',
      lowStock: 'Stocks faibles', recentPay: 'Derniers paiements', viewAll: 'Tout voir',
      create: 'Nouveau', save: 'Enregistrer', cancel: 'Annuler', close: 'Fermer', actions: 'Actions',
      loading: 'Chargement…', empty: 'Aucune donnée.', refresh: 'Actualiser',
      all: 'Tous', confirm: 'Confirmer', post: 'Valider', deliver: 'Livrer', invoice: 'Facturer',
      sku: 'SKU', name: 'Désignation', price: 'Prix vente (centimes)', qty: 'Qté', status: 'Statut',
      customer: 'Client', supplier: 'Fournisseur', total: 'Total', date: 'Date', ref: 'Réf',
      newProduct: 'Nouvel article', newReceipt: 'Entrée stock', stockOp: 'Mouvement stock',
      newSale: 'Nouvelle commande client', newPurchase: 'Nouveau bon d’achat', newParty: 'Nouveau tiers',
      newPayment: 'Enregistrer paiement', newExpense: 'Nouvelle charge', newCount: 'Nouvel inventaire',
      newRoute: 'Nouvelle tournée', warehouse: 'Entrepôt', errLoad: 'Chargement impossible',
      catProducts: 'Produits', catCategories: 'Catégories', catUnits: 'Unités & Colis',
      catPrices: 'Tarifs', catBarcodes: 'Codes-barres', catLots: 'Lots & Séries',
      edit: 'Modifier', detail: 'Détail', del: 'Supprimer', active: 'Actif', inactive: 'Inactif',
      unsupported: 'Non supporté par l’API actuelle', manualEntry: 'Saisie manuelle (pas de scanner lié)',
      skuImmutable: 'SKU immuable après création', needSku: 'Saisissez un SKU pour voir les données liées',
      lines: 'Lignes', addLine: '+ ligne', totals: 'Totaux (serveur)', header: 'En-tête',
      cancelReason: 'Motif d’annulation*', print: 'Imprimer', convert: 'Convertir', delivered: 'Livré',
      returns: 'Retours', balances: 'Soldes', reverse: 'Annuler', allocation: 'Affectation',
      custReturn: '+ retour client', suppReturn: '+ retour fournisseur', onAccount: 'Sans affectation (en compte)',
      notFound: 'Page introuvable', notFoundHint: 'Consultez le menu — toutes les sections prises en charge y figurent',
      payments: 'Paiements', expenses: 'Charges', accounts: 'Comptes',
      drivers: 'Livreurs', vehicles: 'Véhicules',
      fCategory: 'Catégorie', fType: 'Type', fBarcode: 'Code-barres', fCost: 'Coût (ct)',
      fTax: 'Taxe', fMinStock: 'Stock minimum', fNotes: 'Notes', fPhone: 'Téléphone', fRole: 'Rôle',
      fCode: 'Code', fUnit: 'Unité', fPack: 'Nom du colis', fQtyPack: 'Qté par colis',
      fUnitPrice: 'Prix unitaire (ct)', fDiscount: 'Remise (ct)', fDate: 'Date',
      fMethod: 'Mode', fAmount: 'Montant (ct)', fReason: 'Motif', fReference: 'Référence',
      fPlate: 'Plaque', fDesc: 'Description', fDriver: 'Livreur', fVehicle: 'Véhicule',
      fLot: 'Lot', fExpiry: 'Expiration', fSerials: 'Séries', fCounted: 'Compté',
      fPriority: 'Priorité', fScope: 'Portée', fScopeKey: 'Clé de portée', fParent: 'Parent',
      fValidFrom: 'Valide du', fValidTo: 'Valide au', fStart: 'Début', fEnd: 'Fin',
      fOpening: 'Ouverture', fSession: 'Session', fCashAccount: 'Caisse',
      fParty: 'Tiers', fTarget: 'Cible', fProof: 'Preuve', fCollected: 'Encaissé (ct)',
      fTransferNo: 'N° transfert', fDoc: 'Document', fRouteDate: 'Date de tournée',
      fLimit: 'Limite', fOptional: '(optionnel)', fAllowNeg: 'Autoriser le négatif',
      fSerialTr: 'Suivi des séries', fMade: 'Fabriqué le', fCustType: 'Code type client',
      fDirection: 'Direction', hSettleEmpty: 'Laisser vide pour solder le reste.',
      fLimit: 'Limite',
      thId: 'ID', thFrom: 'De', thTo: 'Vers', thBalance: 'Solde', thNet: 'Net',
      thCost: 'Coût', thAvail: 'Dispo.', thMin: 'Min', thLow: 'Faible', thExp: 'Exp.',
      thPack: 'Colis', thPref: 'Préf.', thPrio: 'Prio', thKind: 'Genre', thPlate: 'Plaque',
      thCollected: 'Encaissé', thOut: 'Restant', thRoles: 'Rôles', thActor: 'Acteur',
      thOperation: 'Opération', thEntity: 'Entité', thTime: 'Heure', thPeriod: 'Période',
      thExpected: 'Prévu', thVariance: 'Écart', thReceivable: 'Créance',
      thPayable: 'Dette', thProduct: 'Produit',
      stDraft: 'Brouillon', stConfirmed: 'Confirmé', stPosted: 'Validé', stCancelled: 'Annulé',
      stPending: 'En attente', stDelivered: 'Livré', stFailed: 'Échoué', stPlanned: 'Planifiée',
      stLoaded: 'Chargée', stOut: 'En livraison', stSubmitted: 'Soumise',
      stApproved: 'Approuvée', stPartial: 'Partielle', stPaid: 'Payée', stPartiallyPaid: 'Partiellement payée',
      stOpen: 'Ouverte', stClosed: 'Clôturée',
      dtQuote: 'Devis', dtOrder: 'Commande client', dtDelivery: 'Bon de livraison',
      dtInvoice: 'Facture', dtProforma: 'Proforma', dtPurchase: 'Bon d’achat',
      dtReceipt: 'Bon d’entrée', dtCustReturn: 'Retour client', dtSuppReturn: 'Retour fournisseur',
      pmCash: 'Espèces', pmCard: 'Carte', pmCheck: 'Chèque', pmTransfer: 'Virement', pmMobile: 'Mobile',
      mrDamaged: 'Endommagé', mrExpired: 'Périmé', mrLost: 'Perdu', mrFound: 'Retrouvé',
      mrCorrection: 'Correction', mrDefective: 'Défectueux', mrWrongItem: 'Mauvais article',
      mrCustomerRequest: 'Demande client',
      mrAbsent: 'Client absent', mrRefused: 'Refusé', mrWrongAddr: 'Mauvaise adresse',
      mrVehicleIssue: 'Problème véhicule', mrOther: 'Autre',
      mtReceipt: 'Entrée', mtIssue: 'Sortie', mtAdjust: 'Ajustement', mtTransfer: 'Transfert',
      mtReversal: 'Annulation', mtReturn: 'Retour',
      ptGoods: 'Marchandise', ptService: 'Service', txStandard: 'Standard', txExempt: 'Exonéré',
      scGeneral: 'Générale', scCustomerType: 'Type client', scCustomer: 'Client',
      roleCustomer: 'Client', roleSupplier: 'Fournisseur',
      errGeneric: 'Un problème est survenu. Veuillez réessayer.',
      errValidation: 'Une valeur est invalide. Vérifiez le formulaire.',
      errConflict: 'Cet enregistrement existe déjà.',
      errNotFound: 'Enregistrement introuvable. Il a peut-être été supprimé.',
      errState: 'Cette action est impossible dans l’état actuel.',
      errForbidden: 'Vous n’avez pas la permission pour cette action.',
      errRequired: '{field} est obligatoire.',
      errInteger: '{field} doit être un nombre entier.',
      errPositive: '{field} doit être un nombre positif.',
      errDuplicate: '{what} est déjà enregistré.',
      errProductNotFound: 'Article introuvable : {sku}.',
      errPartyNotFound: 'Tiers introuvable : {code}.',
      errInactive: 'Cet enregistrement est inactif et inutilisable.',
      errInsufficient: 'Stock insuffisant pour cette opération.',
      errRemaining: 'Plus que {n} restant pour cette ligne.',
      errAlready: 'Déjà traité — actualisez la vue.',
      errDeliveryFlow: 'Les bons de livraison passent uniquement par le flux de livraison.',
      errInvoicePayments: 'Cette facture a des paiements actifs : annulez-les d’abord.',
      errOneOpenYear: 'Un exercice ouvert existe déjà ; clôturez-le d’abord.',
      errNetwork: 'Connexion échouée. Vérifiez le réseau et réessayez.',
      errWarehouseNotFound: 'Entrepôt introuvable : {code}.',
      errAccountNotFound: 'Caisse introuvable : {code}.',
      errNothing: 'Rien à modifier.',
      errAllocIncomplete: 'Chaque affectation exige type, document et montant.',
      errAllocExceed: 'Les affectations dépassent le montant du paiement.',
      msgSaved: 'Enregistré ✓', msgDeleted: 'Supprimé ✓', msgDone: 'Terminé ✓',
      msgRefreshed: 'Données actualisées.',
      msgTotal: 'Total : {v}', msgClaim: 'Créance {a} / réglé {b}',
      msgReleased: 'Libéré {n}', msgAvail: 'Disponible : {n}',
      msgCsvDone: 'CSV : lignes affichées uniquement', errExport: 'Export échoué.',
      roleBoth: 'Les deux', srIn: 'En stock', srOut: 'Sorti',
      fInclExp: 'Incl. périmés', fLowOnly: 'Faibles uniquement',
      opIssue: 'Sortie', opAdjust: 'Ajuster', opTransfer: 'Transférer',
      opSettle: 'Encaisser', opReserve: 'Réserver', opRelease: 'Libérer',
      opLoad: 'Charger', opDispatch: 'Expédier', opAssign: 'Assigner',
      opSubmit: 'Soumettre', opApprove: 'Approuver', opRun: 'Exécuter', opStop: 'Arrêt',
      opOpen: 'Ouvrir', opSuggest: 'Suggérer',
      ttlResolve: 'Résoudre', ttlAvail: 'Stock disponible',
      hCrew: 'Équipage', hLoading: 'Chargement', thClaim: 'Créance', thSettled: 'Réglé',
      hDispatchFirst: 'Expédiez d’abord la tournée.',
      hSuggest: 'Suggestion (requête en lecture seule).',
      hReceipts: 'Bons : validé devient annulé par contre-passation.',
      hLedger: 'Mouvements · journal avec solde courant.',
      hMovGuards: 'Les mouvements de bon s’annulent par le bon. Un transfert s’inverse en paire. Jamais de chaîne.',
      hSalesFlow: 'La commande devient livraison, puis facture.',
      hPurchaseFlow: 'Bon d’achat, puis réception.',
      hCashSub: 'Enregistrer, affecter, solder et annuler. Aucun solde inventé.',
      hReportsSub: 'Lecture seule. Vérifié en direct. Aucun chiffre inventé.',
      hStockSub: 'Le stock égale la somme des mouvements.',
      hCatRO: 'Gérer dans Articles, onglet Catégories.',
      hWhGuards: 'MAIN est protégé. Seuls les dépôts secondaires inutilisés sont supprimables.',
      fFiscal: 'Exercice',
      dirIn: 'Entrant', dirOut: 'Sortant',
      opStop: 'Arrêt', opDebtors: 'Tous débiteurs', optBase: 'Base',
      hAllocRule: 'Les affectations ne peuvent pas dépasser le montant. Même tiers imposé.',
      hCodeLocked: 'Le code ne peut plus changer.',
      hSettleHow: 'Arrêts livrés avec créance ouverte uniquement. Lie un paiement.',
      hDraftOnly: 'Brouillons uniquement.',
      hOneOpen: 'Un seul exercice ouvert à la fois.',
      hExpOpt: 'Tiers, taxe et référence optionnels. Les espèces utilisent une caisse.',
      hPlanClaim: 'Réservation de planification uniquement.',
      hNoSerialTransfer: 'Les articles suivis par série ne se transfèrent pas.',
      hRetSrc: 'Source : livraison validée uniquement. Quantité limitée au reste.',
      hSubmitted: 'Motifs uniquement ; quantités figées.',
      hUseDetail: 'Ouvrez le détail pour continuer.',
      hUseCash: 'Continuez dans Caisse, onglet Retours.',
      hListFilters: 'Recherche et statut filtrés côté serveur ; la catégorie filtre la page chargée.',
      hMoneyInt: 'Montants en centimes entiers.',
      hDocCancel: 'Une livraison validée devient un retour. Une facture avec paiements s’annule d’abord.',
      hCompensate: 'Contre-passation compensatoire, historique conservé.',
      hPostedFlow: 'Une livraison validée passe uniquement par le flux de livraison.',
      hRevCash: 'Liens supprimés. Caisse compensée. Ligne annulée.',
      hSuppBounds: 'Limité au reste du bon. Stock vérifié.',
      hBalHow: 'Les créances viennent des factures moins les affectations.',
      hInvFollow: 'Le statut suit les affectations. Actualisez après chaque opération.',
      hDebtors: 'Soldes ouverts : {open} sur {checked} tiers (max 50).',
      hSessGap: 'Sessions par identifiant. Pas de liste ni d’historique.',
      hCatGap: 'Pas de modification. Supprimez les catégories inutilisées.',
      hCountAdd: 'Ajouter une ligne (brouillons, lots gérés).',
      hCountRules: 'L’approbation exige un motif par écart non nul.',
      hRouteMetrics: 'Progrès et montants dans le détail.',
      hNoUpdate: 'Création et activation uniquement.',
      hNoDelete: 'Création et liste uniquement.',
      hNoGps: 'Pas de GPS ni carte : aucune position en direct.',
      hStops: 'Arrêts',
      hCrewLocked: 'Équipage verrouillé après expédition.',
      hLoadReq: 'Chargement : équipage, arrêts, livraisons validées, couverture.',
      hCompleteReq: 'Clôture : zéro arrêt en attente et mixte cohérent.',
      hSettleClaim: 'Le règlement crée un paiement lié.',
      hRegistry: 'Registre des rapports.',
      grpRecv: 'Créances',
      hFiscalT: 'Exercices & journal.',
      hFiscalH: 'Totaux calculés par le serveur. Aucun paramètre fiscal.',
      hAuditT: 'Journal d’audit.', hExpT: 'Exports.', hAboutT: 'À propos.',
      hExpH: 'CSV local des lignes récupérées. La sauvegarde reste une copie opérateur.',
      hAboutH: 'La base locale fait autorité. Intégrité : {a} sur le poste opérateur. Import CLI unique : {b}.',
      hNoApiT: 'Non proposé (sans API).',
      hNoApiH: 'Utilisateurs, profil, sauvegardes, cloud, scanner : aucune API.',
      hLedgerMove: 'Mouvement de stock, sans document.',
      hHistory: 'L’historique montre uniquement le statut et les dates ci-dessus.',
      hRunReport: 'Exécutez un rapport pour voir les résultats.',
      hDelBlocked: 'Les lignes utilisées restent bloquées par le serveur.',
      hMultiInv: 'les livraisons deviennent une facture validée pour le même client.',
      hCloseSess: 'Prévu versus compté devient un écart enregistré.',
      hStopDel: 'Arrêts en attente uniquement, avant expédition.',
      hCloseFy: 'Les écritures hors période ouverte seront rejetées.',
      hBalPos: 'Solde fourni par le serveur, jamais calculé ici.',
      hExpH: 'CSV local des lignes récupérées. La sauvegarde reste une copie opérateur.',
      hAuthoritative: 'Valeur faisant autorité.',
      thAllocIn: 'Aff. entr.', thAllocOut: 'Aff. sort.',
      hShownRO: 'affiché · lecture seule', hShownCap: 'affiché · affichage limité',
      hStockFilters: 'Les filtres portent sur la page chargée (max 200).',
      hServer: 'Valeur serveur.',
      hGen: 'Généré', hRows: 'lignes', hShowing: 'affiché',
      repCurrentStock: 'Stock actuel', repValuation: 'Valorisation', repMovements: 'Mouvements',
      repLow: 'Stock faible', repExpiry: 'Péremption lots', repWhCompare: 'Comparaison dépôts',
      repSalesDate: 'Ventes par date', repSalesCust: 'Ventes par client', repSalesProd: 'Ventes par article',
      repSalesRep: 'Ventes par vendeur', repSalesRoute: 'Ventes par tournée', repSalesType: 'Ventes par type',
      repMargin: 'Marges', repCustBal: 'Soldes clients', repOverdue: 'En retard',
      repPayHist: 'Historique paiements', repAging: 'Ancienneté',
      repPurchSup: 'Achats par fournisseur', repPurchProd: 'Achats par article',
      repPurchDate: 'Achats par date', repRecVsOrd: 'Reçu vs commandé',
      repSuppBal: 'Soldes fournisseurs', repRouteComp: 'Tournées terminées',
      repFailed: 'Livraisons échouées', repQtyDel: 'Quantités livrées',
      repCollect: 'Encaissements', repDriver: 'Performance livreurs',
      repSession: 'Résumé session', repCashIn: 'Entrées caisse', repCashOut: 'Sorties caisse',
      repExp: 'Charges', repAdjust: 'Ajustements', repDiscrep: 'Écarts',
      repCashPos: 'Position caisse',
      dlgConfirmTitle: 'Veuillez confirmer',
      yes: 'Oui', no: 'Non'
    },
    ar: {
      appName: 'المستودع', dashboard: 'اللوحة', sales: 'المبيعات', purchases: 'المشتريات',
      articles: 'المنتجات', stock: 'المخزون', parties: 'المتعاملون', cash: 'الصندوق والمصاريف',
      counts: 'الجرد', routes: 'التوصيل', reports: 'التقارير', settings: 'الإعدادات',
      grpMain: 'رئيسي', grpTrade: 'التجارة', grpStock: 'المخزون', grpMoney: 'المالية', grpOps: 'العمليات',
      searchPh: 'ابحث… (مثلا: سكر 1كغ)', searchLabel: 'بحث', subtitleDash: 'نظرة عامة على النشاط من قاعدة البيانات',
      kpiStock: 'أصناف في المخزون', kpiLow: 'مخزون منخفض', kpiDocs: 'وثائق بيع', kpiRoutes: 'طرق نشطة',
      kpiCash: 'حسابات الصندوق', kpiParties: 'متعاملون', recentSales: 'أحدث وثائق البيع',
      lowStock: 'أصناف منخفضة', recentPay: 'أحدث المدفوعات', viewAll: 'عرض الكل',
      create: 'جديد', save: 'حفظ', cancel: 'إلغاء', close: 'إغلاق', actions: 'إجراء',
      loading: 'جار التحميل…', empty: 'لا توجد بيانات بعد.', refresh: 'تحديث',
      all: 'الكل', confirm: 'تأكيد', post: 'ترحيل', deliver: 'توصيل', invoice: 'فوترة',
      sku: 'SKU', name: 'الاسم', price: 'سعر البيع (سنتيم)', qty: 'الكمية', status: 'الحالة',
      customer: 'الزبون', supplier: 'المورّد', total: 'المجموع', date: 'التاريخ', ref: 'الرقم',
      newProduct: 'منتج جديد', newReceipt: 'استلام مخزون', stockOp: 'عملية مخزون',
      newSale: 'طلب بيع جديد', newPurchase: 'طلب شراء جديد', newParty: 'متعامل جديد',
      newPayment: 'تسجيل دفع', newExpense: 'تسجيل مصروف', newCount: 'بدء جرد',
      newRoute: 'طريق جديد', warehouse: 'المستودع', errLoad: 'تعذر التحميل',
      catProducts: 'المنتجات', catCategories: 'الفئات', catUnits: 'الوحدات والحزم',
      catPrices: 'قوائم الأسعار', catBarcodes: 'الباركود', catLots: 'الحصص والتسلسل',
      edit: 'تعديل', detail: 'تفاصيل', del: 'حذف', active: 'نشط', inactive: 'موقوف',
      unsupported: 'غير مدعوم في API الحالي', manualEntry: 'إدخال يدوي (لا ماسح مرتبط)',
      skuImmutable: 'SKU ثابت بعد الإنشاء', needSku: 'أدخل SKU أولا لعرض البيانات المرتبطة',
      lines: 'السطور', addLine: '+ سطر', totals: 'المجاميع (من الخادم)', header: 'الترويسة',
      cancelReason: 'سبب الإلغاء*', print: 'طباعة', convert: 'تحويل', delivered: 'تم التوصيل',
      returns: 'المرتجعات', balances: 'الأرصدة', reverse: 'عكس', allocation: 'تخصيص',
      custReturn: '+ مرتجع زبون', suppReturn: '+ مرتجع مورّد', onAccount: 'بدون تخصيص (على الحساب)',
      notFound: 'صفحة غير موجودة', notFoundHint: 'تحقق من القائمة — كل الأقسام المدعومة موجودة هناك',
      payments: 'المدفوعات', expenses: 'المصاريف', accounts: 'الحسابات',
      drivers: 'السائقون', vehicles: 'الشاحنات',
      fCategory: 'الفئة', fType: 'النوع', fBarcode: 'الباركود', fCost: 'التكلفة (سنتيم)',
      fTax: 'الضريبة', fMinStock: 'الحد الأدنى للمخزون', fNotes: 'ملاحظات', fPhone: 'الهاتف', fRole: 'الدور',
      fCode: 'الرمز', fUnit: 'الوحدة', fPack: 'اسم الحزمة', fQtyPack: 'الكمية في الحزمة',
      fUnitPrice: 'سعر الوحدة (سنتيم)', fDiscount: 'التخفيض (سنتيم)', fDate: 'التاريخ',
      fMethod: 'الطريقة', fAmount: 'المبلغ (سنتيم)', fReason: 'السبب', fReference: 'المرجع',
      fPlate: 'اللوحة', fDesc: 'الوصف', fDriver: 'السائق', fVehicle: 'الشاحنة',
      fLot: 'الحصة', fExpiry: 'الصلاحية', fSerials: 'الأرقام التسلسلية', fCounted: 'المعدود',
      fPriority: 'الأولوية', fScope: 'النطاق', fScopeKey: 'مفتاح النطاق', fParent: 'الأب',
      fValidFrom: 'صالح من', fValidTo: 'صالح إلى', fStart: 'البداية', fEnd: 'النهاية',
      fOpening: 'الافتتاح', fSession: 'الجلسة', fCashAccount: 'حساب الصندوق',
      fParty: 'المتعامل', fTarget: 'الهدف', fProof: 'المرجع', fCollected: 'المحصّل (سنتيم)',
      fTransferNo: 'رقم التحويل', fDoc: 'الوثيقة', fRouteDate: 'تاريخ الطريق',
      fLimit: 'الحد', fOptional: '(اختياري)', fAllowNeg: 'السماح بالسالب',
      fSerialTr: 'تتبع تسلسلي', fMade: 'تاريخ الصنع', fCustType: 'رمز نوع الزبون',
      fDirection: 'الاتجاه', hSettleEmpty: 'اتركه فارغا لتسوية المبلغ المتبقي.',
      fLimit: 'الحد',
      thId: 'الرقم', thFrom: 'من', thTo: 'إلى', thBalance: 'الرصيد', thNet: 'الصافي',
      thCost: 'التكلفة', thAvail: 'المتاح', thMin: 'الأدنى', thLow: 'منخفض', thExp: 'الص.',
      thPack: 'الحزمة', thPref: 'مفضل', thPrio: 'أولوية', thKind: 'النوع', thPlate: 'اللوحة',
      thCollected: 'المحصّل', thOut: 'المتبقي', thRoles: 'الأدوار', thActor: 'الفاعل',
      thOperation: 'العملية', thEntity: 'الكيان', thTime: 'الوقت', thPeriod: 'الفترة',
      thExpected: 'المتوقع', thVariance: 'الفرق', thReceivable: 'مستحق لنا',
      thPayable: 'مستحق علينا', thProduct: 'المنتج',
      stDraft: 'مسودة', stConfirmed: 'مؤكد', stPosted: 'مرحّل', stCancelled: 'ملغي',
      stPending: 'قيد الانتظار', stDelivered: 'تم التوصيل', stFailed: 'فشل', stPlanned: 'مخطط',
      stLoaded: 'محمّل', stOut: 'قيد التوصيل', stSubmitted: 'مقدّم',
      stApproved: 'معتمد', stPartial: 'جزئي', stPaid: 'مدفوع', stPartiallyPaid: 'مدفوع جزئيا',
      stOpen: 'مفتوح', stClosed: 'مغلق',
      dtQuote: 'عرض سعر', dtOrder: 'طلب بيع', dtDelivery: 'سند توصيل',
      dtInvoice: 'فاتورة بيع', dtProforma: 'فاتورة أولية', dtPurchase: 'طلب شراء',
      dtReceipt: 'سند استلام', dtCustReturn: 'مرتجع زبون', dtSuppReturn: 'مرتجع مورّد',
      pmCash: 'نقدي', pmCard: 'بطاقة', pmCheck: 'شيك', pmTransfer: 'تحويل', pmMobile: 'موبايل',
      mrDamaged: 'تالف', mrExpired: 'منتهي', mrLost: 'ضائع', mrFound: 'موجود',
      mrCorrection: 'تصحيح', mrDefective: 'معيب', mrWrongItem: 'صنف خاطئ',
      mrCustomerRequest: 'طلب الزبون',
      mrAbsent: 'الزبون غائب', mrRefused: 'مرفوض', mrWrongAddr: 'عنوان خاطئ',
      mrVehicleIssue: 'مشكلة شاحنة', mrOther: 'أخرى',
      mtReceipt: 'استلام', mtIssue: 'صرف', mtAdjust: 'تعديل', mtTransfer: 'تحويل',
      mtReversal: 'عكس', mtReturn: 'مرتجع',
      ptGoods: 'سلعة', ptService: 'خدمة', txStandard: 'عادي', txExempt: 'معفى',
      scGeneral: 'عام', scCustomerType: 'نوع الزبون', scCustomer: 'زبون',
      roleCustomer: 'زبون', roleSupplier: 'مورّد',
      errGeneric: 'حدث خطأ. حاول مجددا.',
      errValidation: 'قيمة غير صالحة. تحقق من الاستمارة.',
      errConflict: 'هذا السجل موجود مسبقا.',
      errNotFound: 'السجل غير موجود. ربما تم حذفه.',
      errState: 'هذا الإجراء غير مسموح في الحالة الحالية.',
      errForbidden: 'ليس لديك صلاحية لهذا الإجراء.',
      errRequired: '{field} مطلوب.',
      errInteger: '{field} يجب أن يكون عددا صحيحا.',
      errPositive: '{field} يجب أن يكون عددا موجبا.',
      errDuplicate: '{what} مسجّل مسبقا.',
      errProductNotFound: 'المنتج غير موجود: {sku}.',
      errPartyNotFound: 'المتعامل غير موجود: {code}.',
      errInactive: 'هذا السجل موقوف ولا يمكن استعماله.',
      errInsufficient: 'المخزون غير كاف لهذه العملية.',
      errRemaining: 'المتبقي لهذا السطر: {n} فقط.',
      errAlready: 'تمت المعالجة مسبقا — حدّث العرض.',
      errDeliveryFlow: 'سندات التوصيل تُرحّل عبر مسار التوصيل فقط.',
      errInvoicePayments: 'هذه الفاتورة عليها مدفوعات: اعكسها أولا.',
      errOneOpenYear: 'توجد سنة مالية مفتوحة؛ أغلقها أولا.',
      errNetwork: 'تعذر الاتصال. تحقق من الشبكة وحاول مجددا.',
      errWarehouseNotFound: 'المستودع غير موجود: {code}.',
      errAccountNotFound: 'حساب الصندوق غير موجود: {code}.',
      errNothing: 'لا يوجد ما يُغيَّر.',
      errAllocIncomplete: 'كل تخصيص يحتاج النوع والوثيقة والمبلغ معا.',
      errAllocExceed: 'التخصيصات تتجاوز مبلغ الدفع.',
      msgSaved: 'تم الحفظ ✓', msgDeleted: 'تم الحذف ✓', msgDone: 'تم ✓',
      msgRefreshed: 'تم تحديث البيانات.',
      msgTotal: 'المجموع: {v}', msgClaim: 'المستحق {a} / المسوّى {b}',
      msgReleased: 'تم تحرير {n}', msgAvail: 'المتاح: {n}',
      msgCsvDone: 'CSV: الصفوف المعروضة فقط', errExport: 'فشل التصدير.',
      roleBoth: 'كلاهما', srIn: 'في المخزون', srOut: 'خارج',
      fInclExp: 'شامل المنتهية', fLowOnly: 'المنخفض فقط',
      opIssue: 'صرف', opAdjust: 'تعديل', opTransfer: 'تحويل',
      opSettle: 'تسوية', opReserve: 'حجز', opRelease: 'تحرير',
      opLoad: 'تحميل', opDispatch: 'إرسال', opAssign: 'تعيين',
      opSubmit: 'تقديم', opApprove: 'اعتماد', opRun: 'تشغيل', opStop: 'توقف',
      opOpen: 'فتح', opSuggest: 'اقتراح',
      ttlResolve: 'حلّ', ttlAvail: 'المخزون المتاح',
      hCrew: 'الطاقم', hLoading: 'التحميل', thClaim: 'المستحق', thSettled: 'المسوّى',
      hDispatchFirst: 'أرسل الطريق أولا.',
      hSuggest: 'اقتراح (استعلام للقراءة فقط).',
      hReceipts: 'السندات: المرحّل يُلغى بعكس.',
      hLedger: 'الحركات · دفتر برصيد جارٍ.',
      hMovGuards: 'أرجل السند تُلغى بالسند. التحويل يُعكس كزوج كامل. لا سلاسل أبدا.',
      hSalesFlow: 'الطلب يصبح توصيلا ثم فاتورة.',
      hPurchaseFlow: 'طلب شراء ثم استلام.',
      hCashSub: 'سجّل وخصّص وسوِّ واعكس. لا أرصدة مختلقة.',
      hReportsSub: 'للقراءة فقط. يُتحقق مباشرة. لا أرقام مختلقة.',
      hStockSub: 'المخزون يساوي مجموع الحركات.',
      hCatRO: 'أدرها في المنتجات، تبويب الفئات.',
      hWhGuards: 'MAIN محمي. فقط المستودعات غير المستعملة تُحذف.',
      fFiscal: 'السنة المالية',
      dirIn: 'وارد', dirOut: 'صادر',
      opStop: 'توقف', opDebtors: 'كل المدينين', optBase: 'الأساسي',
      hAllocRule: 'لا يجوز أن تتجاوز التخصيصات المبلغ. نفس المتعامل.',
      hCodeLocked: 'لا يمكن تغيير الرمز لاحقا.',
      hSettleHow: 'التوقفات المسلَّمة ذات المستحق المفتوح فقط. يربط دفعة.',
      hDraftOnly: 'المسودات فقط.',
      hOneOpen: 'سنة مفتوحة واحدة في كل مرة.',
      hExpOpt: 'المتعامل والضريبة والمرجع اختيارية. النقدي يستعمل حسابا.',
      hPlanClaim: 'حجز تخطيط فقط.',
      hNoSerialTransfer: 'الأصناف المتبعة تسلسليا لا تُحوَّل.',
      hRetSrc: 'المصدر توصيل مرحّل فقط. الكمية محدودة بالباقي.',
      hSubmitted: 'الأسباب فقط؛ الكميات مجمدة.',
      hUseDetail: 'افتح التفاصيل للمتابعة.',
      hUseCash: 'تابع في الصندوق، تبويب المرتجعات.',
      hListFilters: 'البحث والحالة في الخادم؛ الفئة تصفّي الصفحة المحملة.',
      hMoneyInt: 'المبالغ بسنتيمات صحيحة.',
      hDocCancel: 'التوصيل المرحّل يصبح مرتجعا. الفاتورة ذات المدفوعات تُعكس أولا.',
      hCompensate: 'عكس تعويضي، والسجل محفوظ.',
      hPostedFlow: 'التوصيل المرحّل عبر مسار التوصيل فقط.',
      hRevCash: 'تُزال الروابط. يُعوَّض الصندوق. يُلغى السطر.',
      hSuppBounds: 'محدود بباقي السند. المخزون متحقق.',
      hBalHow: 'المستحقات من الفواتير ناقص التخصيصات.',
      hInvFollow: 'الحالة تتبع التخصيصات. حدّث بعد كل عملية.',
      hDebtors: 'أرصدة مفتوحة: {open} من {checked} (حد 50).',
      hSessGap: 'الجلسات بالرقم. لا قائمة ولا سجل.',
      hCatGap: 'لا تعديل. احذف الفئات غير المستعملة.',
      hCountAdd: 'أضف سطرا (المسودات فقط).',
      hCountRules: 'الاعتماد يحتاج سببا لكل فرق غير صفري.',
      hRouteMetrics: 'التقدم والمبالغ في التفاصيل.',
      hNoUpdate: 'إنشاء وتفعيل فقط.',
      hNoDelete: 'إنشاء وسرد فقط.',
      hNoGps: 'لا GPS ولا خريطة: لا مواقع مباشرة.',
      hStops: 'التوقفات',
      hCrewLocked: 'الطاقم مقفل بعد الإرسال.',
      hLoadReq: 'التحميل: طاقم وتوقفات وتوصيلات مرحّلة وتغطية.',
      hCompleteReq: 'الإتمام: صفر معلق ومزيج متطابق.',
      hSettleClaim: 'التسوية تنشئ دفعة مرتبطة.',
      hRegistry: 'سجل التقارير.',
      grpRecv: 'المستحقات',
      hFiscalT: 'السنوات والدفتر.',
      hFiscalH: 'المجاميع من الخادم. لا إعدادات ضرائب.',
      hAuditT: 'سجل التدقيق.', hExpT: 'التصدير.', hAboutT: 'حول.',
      hExpH: 'CSV محلي للصفوف المسترجعة. النسخة المرجعية نسخة المشغّل.',
      hAboutH: 'قاعدة البيانات المحلية هي المرجع. السلامة: {a} على جهاز المشغّل. الاستيراد CLI لمرة واحدة: {b}.',
      hNoApiT: 'غير متوفر (لا API).',
      hNoApiH: 'المستخدمون والملف والنسخ والسحابة والماسح: لا API.',
      hLedgerMove: 'حركة مخزون، بلا وثيقة.',
      hHistory: 'السجل يعرض الحالة والتواريخ أعلاه فقط.',
      hRunReport: 'شغّل تقريرا لرؤية النتائج.',
      hDelBlocked: 'الصفوف المرتبطة تبقى محظورة من الخادم.',
      hMultiInv: 'التوصيلات تصبح فاتورة مرحّلة واحدة لنفس الزبون.',
      hCloseSess: 'المتوقع مقابل المعدود يصبح فرقا مسجلا.',
      hStopDel: 'التوقفات المعلقة فقط، قبل الإرسال.',
      hCloseFy: 'القيود خارج الفترة المفتوحة ستُرفض.',
      hBalPos: 'الرصيد من الخادم ولا يُحسب هنا أبدا.',
      hExpH: 'CSV محلي للصفوف المسترجعة. النسخة المرجعية نسخة المشغّل.',
      hAuthoritative: 'قيمة مرجعية.',
      thAllocIn: 'تخصيص وارد', thAllocOut: 'تخصيص صادر',
      hShownRO: 'معروض · للقراءة فقط', hShownCap: 'معروض · عرض محدود',
      hStockFilters: 'المرشحات على الصفحة المحملة (حد 200).',
      hServer: 'قيمة الخادم.',
      hGen: 'أُنشئ', hRows: 'صفوف', hShowing: 'معروض',
      repCurrentStock: 'المخزون الحالي', repValuation: 'التقييم', repMovements: 'الحركات',
      repLow: 'مخزون منخفض', repExpiry: 'صلاحية الحصص', repWhCompare: 'مقارنة المستودعات',
      repSalesDate: 'المبيعات حسب التاريخ', repSalesCust: 'حسب الزبون', repSalesProd: 'حسب المنتج',
      repSalesRep: 'حسب البائع', repSalesRoute: 'حسب الطريق', repSalesType: 'حسب النوع',
      repMargin: 'الهوامش', repCustBal: 'أرصدة الزبائن', repOverdue: 'متأخرة',
      repPayHist: 'سجل المدفوعات', repAging: 'الأقدمية',
      repPurchSup: 'المشتريات حسب المورّد', repPurchProd: 'حسب المنتج',
      repPurchDate: 'حسب التاريخ', repRecVsOrd: 'المستلم مقابل المطلوب',
      repSuppBal: 'أرصدة المورّدين', repRouteComp: 'إتمام الطرق',
      repFailed: 'توصيلات فاشلة', repQtyDel: 'الكميات المسلَّمة',
      repCollect: 'التحصيلات', repDriver: 'أداء السائقين',
      repSession: 'ملخص الجلسة', repCashIn: 'مقبوضات الصندوق', repCashOut: 'مدفوعات الصندوق',
      repExp: 'المصاريف', repAdjust: 'التعديلات', repDiscrep: 'الفروقات',
      repCashPos: 'وضعية الصندوق',
      dlgConfirmTitle: 'يرجى التأكيد',
      yes: 'نعم', no: 'لا'
    }
  };

  function has(lang, key) {
    return Boolean(STR[lang] && STR[lang][key] !== undefined && STR[lang][key] !== '');
  }

  function keys() { return Object.keys(STR.ar); }

  function fill(str, params) {
    return String(str).replace(/\{([A-Za-z0-9_]+)\}/g, function (m, k) {
      return params && params[k] !== undefined && params[k] !== null ? String(params[k]) : m;
    });
  }

  function warn(msg) {
    try { if (typeof console !== 'undefined' && console.warn) console.warn(msg); } catch (e) { /* ignore */ }
  }

  function t(lang, key, params) {
    var L = STR[lang] || {};
    if (L[key] !== undefined && L[key] !== '') return fill(L[key], params);
    warn('[i18n:missing] lang=' + lang + ' key=' + key);
    return '[' + key + ']';
  }

  function dir(lang) { return lang === 'ar' ? 'rtl' : 'ltr'; }

  function locale(lang) { return LOCALES[lang] || 'en-DZ'; }

  function fmtNum(lang, n) {
    try { return new Intl.NumberFormat(locale(lang)).format(n); }
    catch (e) { return String(n); }
  }

  function fmtDate(lang, iso) {
    if (iso === null || iso === undefined || iso === '') return '';
    var s = String(iso);
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return s;
    try {
      var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      return new Intl.DateTimeFormat(locale(lang), { dateStyle: 'medium' }).format(d);
    } catch (e) { return s; }
  }

  var STATUS = {
    draft: 'stDraft', confirmed: 'stConfirmed', posted: 'stPosted', cancelled: 'stCancelled',
    pending: 'stPending', delivered: 'stDelivered', failed: 'stFailed', planned: 'stPlanned',
    loaded: 'stLoaded', out_for_delivery: 'stOut', submitted: 'stSubmitted',
    approved: 'stApproved', partial: 'stPartial', paid: 'stPaid', partially_paid: 'stPartiallyPaid',
    open: 'stOpen', closed: 'stClosed', expired: 'mrExpired',
    active: 'active', inactive: 'inactive'
  };

  var DOCTYPE = {
    sales_quote: 'dtQuote', sales_order: 'dtOrder', delivery_note: 'dtDelivery',
    sales_invoice: 'dtInvoice', proforma_invoice: 'dtProforma', purchase_order: 'dtPurchase',
    purchase_receipt: 'dtReceipt', customer_return: 'dtCustReturn', supplier_return: 'dtSuppReturn'
  };

  var PAYMETHOD = { cash: 'pmCash', card: 'pmCard', check: 'pmCheck', bank_transfer: 'pmTransfer', mobile: 'pmMobile' };

  var MOVEREASON = {
    damaged: 'mrDamaged', expired: 'mrExpired', lost: 'mrLost', found: 'mrFound',
    correction: 'mrCorrection', defective: 'mrDefective', wrong_item: 'mrWrongItem',
    customer_request: 'mrCustomerRequest', customer_absent: 'mrAbsent', refused: 'mrRefused',
    wrong_address: 'mrWrongAddr', vehicle_issue: 'mrVehicleIssue', other: 'mrOther'
  };

  var MOVETYPE = {
    purchase_receipt: 'mtReceipt', purchase_receipt_reversal: 'mtReversal', adjustment: 'mtAdjust',
    issue: 'mtIssue', transfer_out: 'mtTransfer', transfer_in: 'mtTransfer', reversal: 'mtReversal',
    sales_return: 'mtReturn', purchase_return: 'mtReturn'
  };

  function map(lang, table, code) {
    var key = table[code];
    if (!key) return code;
    return t(lang, key);
  }

  function status(lang, code) { return map(lang, STATUS, String(code || '')); }
  function docType(lang, code) { return map(lang, DOCTYPE, String(code || '')); }
  function payMethod(lang, code) { return map(lang, PAYMETHOD, String(code || '')); }
  function moveReason(lang, code) { return map(lang, MOVEREASON, String(code || '')); }
  function moveType(lang, code) { return map(lang, MOVETYPE, String(code || '')); }

  function productType(lang, code) { return code === 'service' ? t(lang, 'ptService') : t(lang, 'ptGoods'); }
  function taxClass(lang, code) { return code === 'exempt' ? t(lang, 'txExempt') : t(lang, 'txStandard'); }
  function priceScope(lang, code) {
    if (code === 'customer_type') return t(lang, 'scCustomerType');
    if (code === 'customer') return t(lang, 'scCustomer');
    return t(lang, 'scGeneral');
  }
  function partyRole(lang, code) { return code === 'supplier' ? t(lang, 'roleSupplier') : t(lang, 'roleCustomer'); }

  var CODE_OF = { VALIDATION: 'errValidation', CONFLICT: 'errConflict', NOT_FOUND: 'errNotFound', INVALID_STATE: 'errState', FORBIDDEN: 'errForbidden' };

  function byPattern(msg) {
    var s = String(msg || '');
    if (/UNIQUE constraint|already exists|already registered|duplicate|doublon|مسبقا|مسجّل/i.test(s)) return 'errConflict';
    if (/only \d+ remaining|remaining to return|remaining on/i.test(s)) return 'errRemaining';
    if (/insufficient|have \d+/i.test(s)) return 'errInsufficient';
    if (/is inactive|inactive and cannot|désactivé|موقوف/i.test(s)) return 'errInactive';
    if (/product .* not found|article introuvable|المنتج غير موجود/i.test(s)) return 'errProductNotFound';
    if (/party .* not found|tiers introuvable|customer .*introuvable|المتعامل غير موجود/i.test(s)) return 'errPartyNotFound';
    if (/not found|introuvable|NOT_FOUND|غير موجود/i.test(s)) return 'errNotFound';
    if (/reason.*required|a .* reason is required|motif.*obligatoire/i.test(s)) return 'errValidation';
    if (/is required|est obligatoire|obligatoire|مطلوب/i.test(s)) return 'errValidation';
    if (/must be|doit être|entier|integer|يجب أن يكون/i.test(s)) return 'errValidation';
    if (/was already|already (reversed|cancelled|posted|confirmed)|déjà/i.test(s)) return 'errAlready';
    if (/fulfillment|delivery notes post through/i.test(s)) return 'errDeliveryFlow';
    if (/live payments|reverse them before/i.test(s)) return 'errInvoicePayments';
    if (/open fiscal|exercice ouvert|سنة مالية مفتوحة/i.test(s)) return 'errOneOpenYear';
    if (/Failed to fetch|NetworkError|network|request failed|connexion/i.test(s)) return 'errNetwork';
    if (/failed|échec|فشل/i.test(s) && /post|load|dispatch|revers/i.test(s)) return 'errGeneric';
    return null;
  }

  function extractParam(msg, re) {
    var m = String(msg || '').match(re);
    return m ? m[1] : undefined;
  }

  function err(lang, e) {
    if (!e) return t(lang, 'errGeneric');
    if (e.key && has(lang, e.key)) return t(lang, e.key, e.params);
    if (e.key) { warn('[i18n:missing] lang=' + lang + ' key=' + e.key); }
    var msg = (e && e.message) || String(e);
    var code = e && e.code;
    if (!code) {
      if (/UNIQUE constraint failed/i.test(msg)) code = 'CONFLICT';
      else if (/NOT_FOUND/i.test(msg)) code = 'NOT_FOUND';
    }
    var specific = byPattern(msg);
    if (specific === 'errProductNotFound') {
      var sku = extractParam(msg, /sku (\S+)/i) || extractParam(msg, /: (.+)\.?$/);
      return t(lang, 'errProductNotFound', { sku: sku || '?' });
    }
    if (specific === 'errPartyNotFound') {
      var pc = extractParam(msg, /[:(]\s*([A-Za-z0-9][A-Za-z0-9._-]*)\s*\)?\.?\s*$/);
      return t(lang, 'errPartyNotFound', { code: pc || '?' });
    }
    if (specific === 'errRemaining') {
      var n = extractParam(msg, /only (\d+)/i);
      return t(lang, 'errRemaining', { n: n || '?' });
    }
    if (specific) return t(lang, specific);
    if (code && CODE_OF[code]) return t(lang, CODE_OF[code]);
    warn('[i18n:error] ' + msg);
    return t(lang, 'errGeneric');
  }

  function ex(key, params, code) {
    return { message: key, key: key, params: params || {}, code: code || 'VALIDATION' };
  }

  function debug(e) {
    var detail;
    try {
      detail = (e && e.stack) ? e.stack : (e && typeof e === 'object' ? JSON.stringify(e) : String(e));
    } catch (err2) { detail = 'unprintable'; }
    warn('[debug] ' + detail);
  }

  root.I18N = {
    STR: STR, SUPPORTED: SUPPORTED, t: t, has: has, keys: keys,
    dir: dir, locale: locale, fmtNum: fmtNum, fmtDate: fmtDate,
    status: status, docType: docType, payMethod: payMethod, moveReason: moveReason,
    moveType: moveType, productType: productType, taxClass: taxClass,
    priceScope: priceScope, partyRole: partyRole, err: err, ex: ex, debug: debug
  };
})(typeof window !== 'undefined' ? window : this);
