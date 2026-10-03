/**
 * Charte de confidentialité standard, affichée en bas de page (lien « Confidentialité »).
 * Texte type : à faire valider par un juriste et à compléter (coordonnées de l'éditeur) avant commercialisation.
 */
// Fonction (et non constante) : Apps Script charge les fichiers dans un ordre quelconque, CFG n'existe pas encore à la lecture de ce fichier.
function charte_() {
  return {
  maj: '2026-10-01',
  sections: [
    { titre: 'Qui est responsable de vos données ?', texte: 'La société qui vous a ouvert un accès (votre employeur ou prestataire, dont le nom figure en haut de l\'écran) est responsable du traitement de vos données. L\'éditeur du logiciel, ' + CFG.EDITEUR + ', agit comme sous-traitant : il héberge et fait fonctionner l\'application pour le compte de cette société, selon ses instructions.' },
    { titre: 'Quelles données sont traitées ?', texte: 'Identité professionnelle (nom, fonction, affectation, e-mail professionnel), pointages (travail, repos, absence), demandes administratives, documents que vous ou votre responsable déposez (titre de congé, attestations, fiches d\'émoluments…), journaux techniques de connexion. Les mots de passe sont conservés sous forme chiffrée (hachés et salés) et ne sont lisibles par personne.' },
    { titre: 'Pourquoi ?', texte: 'Suivre la présence du personnel, établir les fiches de pointage, les attachements et les factures liés au contrat avec le client, gérer les demandes et les documents administratifs. Ces données ne sont ni vendues, ni utilisées à des fins publicitaires ou de profilage.' },
    { titre: 'Qui y a accès ?', texte: 'Chaque agent voit ses propres données ; le chef de groupe, celles de son groupe ; l\'administrateur de la société, l\'ensemble de ses données. Le client final du contrat (compte de consultation) ne voit que le pointage, le contrat, les attachements et les factures validés, jamais les demandes ni les documents personnels. Les données de chaque société sont séparées de celles des autres sociétés.' },
    { titre: 'Où et combien de temps ?', texte: 'Les données sont hébergées sur les services Google (Google Sheets et Google Drive) rattachés au compte de l\'éditeur, avec une copie de sauvegarde. Elles sont conservées pendant la durée du contrat puis restituées ou supprimées à la demande de la société, dans un délai raisonnable après la fin du contrat. Les obligations légales de conservation (comptabilité, droit du travail) restent applicables.' },
    { titre: 'Sécurité', texte: 'Accès par identifiant et mot de passe, sessions limitées dans le temps, droits distincts par rôle, mots de passe chiffrés, contrôle des tentatives de connexion, sauvegardes. Chacun doit garder son mot de passe confidentiel et le changer s\'il le croit connu d\'un tiers.' },
    { titre: 'Vos droits', texte: 'Conformément à la loi algérienne n° 18-07 relative à la protection des personnes physiques dans le traitement des données à caractère personnel (et, le cas échéant, au RGPD), vous pouvez demander l\'accès, la rectification ou la suppression de vos données, et vous opposer à leur traitement pour motif légitime. Adressez votre demande à l\'administrateur de votre société ; en cas de difficulté, à l\'éditeur.' },
    { titre: 'Cookies et stockage local', texte: 'L\'application n\'utilise aucun traceur publicitaire. Elle mémorise seulement sur votre appareil l\'adresse de l\'application, le code entreprise et les préférences d\'affichage, pour vous éviter de les ressaisir.' },
    { titre: 'Modifications', texte: 'Cette charte peut évoluer ; la date de dernière mise à jour figure ci-dessous. Toute modification importante sera communiquée par l\'administrateur de votre société.' }
  ]
  };
}
