// -----------------------------------------------------------------------------
// Every text the container sends to the user, in English, French, German
// (informal "du") and Spanish (formal "usted"). A template is a function
// returning the four texts.
// -----------------------------------------------------------------------------

export const MESSAGES = {
  status: {
    signed_out: {
      en: 'Not signed in to Amazon: choose your marketplace, save, then click "Connect".',
      fr: 'Pas connecté à Amazon : choisissez votre site Amazon, enregistrez, puis cliquez sur « Connecter ».',
      de: 'Nicht bei Amazon angemeldet: Wähle deinen Amazon-Marktplatz, speichere und klicke dann auf „Verbinden“.',
      es: 'Sin sesión en Amazon: elija su sitio de Amazon, guarde y luego haga clic en «Conectar».',
    },
    refused: {
      en: 'Amazon refused the stored sign-in: sign in again.',
      fr: 'Amazon a refusé la connexion enregistrée : reconnectez-vous.',
      de: 'Amazon hat die gespeicherte Anmeldung abgelehnt: Melde dich erneut an.',
      es: 'Amazon rechazó el inicio de sesión guardado: vuelva a iniciar sesión.',
    },
    unreachable: {
      en: 'Amazon cannot be reached for now, new attempt soon.',
      fr: "Amazon est injoignable pour l'instant, nouvel essai bientôt.",
      de: 'Amazon ist gerade nicht erreichbar, neuer Versuch in Kürze.',
      es: 'Amazon no está disponible por ahora, nuevo intento en breve.',
    },
    throttled: {
      en: 'Amazon is limiting the requests: the refresh slows down for a while.',
      fr: 'Amazon limite les requêtes : le rafraîchissement ralentit un moment.',
      de: 'Amazon begrenzt die Anfragen: Die Aktualisierung wird eine Weile langsamer.',
      es: 'Amazon está limitando las solicitudes: la actualización se ralentiza un tiempo.',
    },
  },
  errors: {
    not_signed_in: {
      en: 'Not signed in to Amazon: see the configuration of the integration.',
      fr: "Pas connecté à Amazon : voir la configuration de l'intégration.",
      de: 'Nicht bei Amazon angemeldet: siehe die Konfiguration der Integration.',
      es: 'Sin sesión en Amazon: consulte la configuración de la integración.',
    },
    refused: {
      en: 'Amazon refused the stored sign-in: sign in again from the configuration.',
      fr: 'Amazon a refusé la connexion enregistrée : reconnectez-vous depuis la configuration.',
      de: 'Amazon hat die gespeicherte Anmeldung abgelehnt: Melde dich in der Konfiguration erneut an.',
      es: 'Amazon rechazó el inicio de sesión guardado: vuelva a iniciar sesión desde la configuración.',
    },
    throttled: {
      en: 'Amazon is limiting the requests: try again in a minute.',
      fr: 'Amazon limite les requêtes : réessayez dans une minute.',
      de: 'Amazon begrenzt die Anfragen: Versuche es in einer Minute erneut.',
      es: 'Amazon está limitando las solicitudes: inténtelo de nuevo en un minuto.',
    },
    amazon_failed: {
      en: 'Amazon did not accept the command. Check the integration logs.',
      fr: "Amazon n'a pas accepté la commande. Consultez les logs de l'intégration.",
      de: 'Amazon hat den Befehl nicht angenommen. Sieh in die Logs der Integration.',
      es: 'Amazon no aceptó el comando. Consulte los registros de la integración.',
    },
    unknown_device: {
      en: 'This Echo is no longer on the Amazon account.',
      fr: "Cet Echo n'est plus sur le compte Amazon.",
      de: 'Dieser Echo ist nicht mehr im Amazon-Konto.',
      es: 'Este Echo ya no está en la cuenta de Amazon.',
    },
    no_device: {
      en: 'Choose at least one Echo.',
      fr: 'Choisissez au moins un Echo.',
      de: 'Wähle mindestens einen Echo aus.',
      es: 'Elija al menos un Echo.',
    },
    empty_text: {
      en: 'The text to say is empty.',
      fr: 'Le texte à dire est vide.',
      de: 'Der zu sprechende Text ist leer.',
      es: 'El texto que decir está vacío.',
    },
    not_a_notification: {
      en: 'The notification is neither a text nor an https address of an audio file.',
      fr: "La notification n'est ni un texte ni l'adresse https d'un fichier audio.",
      de: 'Die Benachrichtigung ist weder ein Text noch eine https-Adresse einer Audiodatei.',
      es: 'La notificación no es ni un texto ni una dirección https de un archivo de audio.',
    },
    no_player: {
      en: 'This Echo has no music player.',
      fr: "Cet Echo n'a pas de lecteur de musique.",
      de: 'Dieser Echo hat keinen Musikplayer.',
      es: 'Este Echo no tiene reproductor de música.',
    },
    no_routine_name: {
      en: 'Give the name of the Alexa routine to run.',
      fr: 'Indiquez le nom de la routine Alexa à lancer.',
      de: 'Gib den Namen der auszuführenden Alexa-Routine an.',
      es: 'Indique el nombre de la rutina de Alexa que desea ejecutar.',
    },
    routine_not_found: (name) => ({
      en: `No Alexa routine is called "${name}". The "List my Alexa routines" button shows their names.`,
      fr: `Aucune routine Alexa ne s'appelle « ${name} ». Le bouton « Lister mes routines Alexa » montre leurs noms.`,
      de: `Keine Alexa-Routine heißt „${name}“. Die Schaltfläche „Meine Alexa-Routinen auflisten“ zeigt ihre Namen.`,
      es: `Ninguna rutina de Alexa se llama «${name}». El botón «Listar mis rutinas de Alexa» muestra sus nombres.`,
    }),
    unknown_command: {
      en: 'This feature cannot be controlled.',
      fr: 'Cette fonctionnalité ne se commande pas.',
      de: 'Diese Funktion lässt sich nicht steuern.',
      es: 'Esta función no se puede controlar.',
    },
  },
  sign_in: {
    no_flow: {
      en: 'No sign-in in progress: click "Connect" first, sign in on the Amazon page, then paste the address here.',
      fr: "Aucune connexion en cours : cliquez d'abord sur « Connecter », connectez-vous sur la page Amazon, puis collez l'adresse ici.",
      de: 'Keine Anmeldung läuft: Klicke zuerst auf „Verbinden“, melde dich auf der Amazon-Seite an und füge dann die Adresse hier ein.',
      es: 'No hay ningún inicio de sesión en curso: haga clic primero en «Conectar», inicie sesión en la página de Amazon y pegue aquí la dirección.',
    },
    expired: {
      en: 'This sign-in is too old: click "Connect" again.',
      fr: 'Cette connexion est trop ancienne : cliquez à nouveau sur « Connecter ».',
      de: 'Diese Anmeldung ist zu alt: Klicke erneut auf „Verbinden“.',
      es: 'Este inicio de sesión es demasiado antiguo: vuelva a hacer clic en «Conectar».',
    },
    not_an_address: {
      en: 'This is not a web address. Copy the whole address of the Amazon page you landed on.',
      fr: "Ce n'est pas une adresse web. Copiez l'adresse complète de la page Amazon où vous êtes arrivé.",
      de: 'Das ist keine Webadresse. Kopiere die vollständige Adresse der Amazon-Seite, auf der du gelandet bist.',
      es: 'Esto no es una dirección web. Copie la dirección completa de la página de Amazon a la que llegó.',
    },
    not_a_return_address: {
      en: 'This is not the return address: after signing in, Amazon shows a page whose address contains "/ap/maplanding". Copy that one.',
      fr: "Ce n'est pas l'adresse de retour : après la connexion, Amazon affiche une page dont l'adresse contient « /ap/maplanding ». Copiez celle-là.",
      de: 'Das ist nicht die Rücksprungadresse: Nach der Anmeldung zeigt Amazon eine Seite, deren Adresse „/ap/maplanding“ enthält. Kopiere diese.',
      es: 'Esta no es la dirección de retorno: después de iniciar sesión, Amazon muestra una página cuya dirección contiene «/ap/maplanding». Copie esa.',
    },
    other_marketplace: {
      en: 'This address belongs to another Amazon marketplace than the one of the configuration. Click "Connect" again.',
      fr: 'Cette adresse appartient à un autre site Amazon que celui de la configuration. Cliquez à nouveau sur « Connecter ».',
      de: 'Diese Adresse gehört zu einem anderen Amazon-Marktplatz als dem der Konfiguration. Klicke erneut auf „Verbinden“.',
      es: 'Esta dirección pertenece a otro sitio de Amazon distinto al de la configuración. Vuelva a hacer clic en «Conectar».',
    },
    no_code: {
      en: 'This address has no authorization code: copy it again, whole, right after signing in.',
      fr: "Cette adresse ne contient pas de code d'autorisation : recopiez-la en entier, juste après la connexion.",
      de: 'Diese Adresse enthält keinen Autorisierungscode: Kopiere sie direkt nach der Anmeldung noch einmal vollständig.',
      es: 'Esta dirección no contiene código de autorización: cópiela de nuevo, completa, justo después de iniciar sesión.',
    },
    refused: {
      en: 'Amazon refused the sign-in (the code is single-use and expires after a few minutes). Click "Connect" and try again.',
      fr: "Amazon a refusé la connexion (le code ne sert qu'une fois et expire en quelques minutes). Cliquez sur « Connecter » et recommencez.",
      de: 'Amazon hat die Anmeldung abgelehnt (der Code gilt nur einmal und läuft nach wenigen Minuten ab). Klicke auf „Verbinden“ und versuche es erneut.',
      es: 'Amazon rechazó el inicio de sesión (el código es de un solo uso y caduca en unos minutos). Haga clic en «Conectar» e inténtelo de nuevo.',
    },
    done: (count) => ({
      en: `Signed in to Amazon. Echos found: ${count}. Add them from the Discover tab.`,
      fr: `Connecté à Amazon. Echo trouvés : ${count}. Ajoutez-les depuis l'onglet Découverte.`,
      de: `Bei Amazon angemeldet. Gefundene Echos: ${count}. Füge sie im Tab „Entdecken“ hinzu.`,
      es: `Sesión iniciada en Amazon. Echo encontrados: ${count}. Añádalos desde la pestaña Descubrir.`,
    }),
    signed_out: {
      en: 'Signed out: the credentials are deleted from Gladys.',
      fr: 'Déconnecté : les identifiants sont supprimés de Gladys.',
      de: 'Abgemeldet: Die Zugangsdaten wurden aus Gladys gelöscht.',
      es: 'Sesión cerrada: las credenciales se han eliminado de Gladys.',
    },
  },
  routines: {
    none: {
      en: 'No routine on this Amazon account.',
      fr: 'Aucune routine sur ce compte Amazon.',
      de: 'Keine Routine in diesem Amazon-Konto.',
      es: 'No hay ninguna rutina en esta cuenta de Amazon.',
    },
    list: (names) => ({
      en: `Alexa routines (names to use in a scene):\n${names}`,
      fr: `Routines Alexa (noms à utiliser dans une scène) :\n${names}`,
      de: `Alexa-Routinen (Namen für eine Szene):\n${names}`,
      es: `Rutinas de Alexa (nombres que usar en una escena):\n${names}`,
    }),
  },
  test_spoken: (name) => ({
    en: `Sent to ${name}.`,
    fr: `Envoyé à ${name}.`,
    de: `An ${name} gesendet.`,
    es: `Enviado a ${name}.`,
  }),
  nothing_playing: {
    en: 'Nothing playing',
    fr: 'Rien en cours',
    de: 'Keine Wiedergabe',
    es: 'Nada en reproducción',
  },
};
