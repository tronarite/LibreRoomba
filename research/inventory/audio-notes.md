# Audio y voz de la Roomba i1+: análisis estático (2026-10-24)

Solo `strings -a` sobre `research/native/lib/arm64-v8a/*.so` y búsqueda en `research/jadx-res/`. No se tocó el robot ni la nube. Confianza: **alta** = cadena literal; **media** = deducido de nombres de símbolos; **baja** = hipótesis.

## 1. Órdenes de idioma/audio

| Orden | Formato | Evidencia | Confianza |
|---|---|---|---|
| `SetRobotLanguageV2` | `{ "langs2" : { "sLang" : "%s" }}` (valor tipo `es-ES`, uno de `langs2.dLangs.langs`) | `libcore_jni.so`: cadena literal junto a `CommandId::kSetRobotLanguageV2`; `libcore_base.so`: `SetRobotLanguageV2` | alta (formato), media (que baste enviarlo por `delta`) |
| Idioma antiguo (V1) | `{ "language" : %s }` (el `%s` sin comillas sugiere un id numérico: `RobotLanguage` tiene `getId`, `getLocaleName`, `getVoiceName`) | `libcore_base.so` | media |
| Versión de audio | solo lectura: `kAudio`, `kAudioVersion` (`RoombaAudioVersionDeserializer`, error "Cannot convert string to int for audio version.") y `UpdateUIServiceData::setAudioVersion(int)` | `libcore_base.so`, `libcore_jni.so` | media |
| Idiomas disponibles | solo lectura: `kAvailableLanguages` → `RobotLanguagesAvailableEvent`; `kLanguageV2` → `RobotLanguagesV2Event` | `libcore_base.so` | media |

Estructura real de `langs2` (muestra del APK, `jadx-res/resources/res/raw/ruby_iot_sim_responses.json`, otro modelo): `{"sVer":"1.0","dLangs":{"ver":"0.27","langs":["ar-SA", ... , "es-ES", ...]},"sLang":"es-ES","aSlots":0}`. Tu i1+ reporta `dLangs.ver "0.3"` con 5 idiomas, `uLangs:null`, `aSlots:1` y `cap.lang:2`, `cap.langOta:2` (estado volcado en la sesión).

Interpretación (media/baja): `dLangs` = idiomas ya instalados en el robot, `uLangs` = idiomas instalados por el usuario/descargados, `aSlots` = huecos libres para paquetes descargables (en el modelo de la muestra vale 0 porque ya trae 20+ idiomas de fábrica). Ninguna de estas subclaves (`uLangs`, `aSlots`, `dLangs`) aparece como cadena en las librerías: el JSON se lee con claves construidas de otra forma, así que su significado exacto no está confirmado.

## 2. Descarga e instalación de paquetes de voz

No hay ninguna orden local para subir un paquete de voz. El mecanismo es una **OTA bajo demanda** que arranca el robot contra la nube de iRobot:

- Orden `StartOnDemandOta` (`CommandId::kStartOnDemandOta`, `libcore_jni.so`) y `StartOTAUpdateCommand` (cadena en `libcore_jni.so`). Alta.
- `UpdateUIService::requestLocalOta` / `attemptLocalOta` / `queryLocalOtaStatus` / `queryOnDemandOTAAvailability(OnDemandOTAPathType)`, eventos `LocalOtaStatusEvent`, `RequestOtaStatusEvent`, `OnDemandOTAAvailabilityEvent`. Media.
- `UpdateUIServiceData::setLanguagePackForOnDemandOTA(RobotLanguagePackV2)` y `LanguageSetting::isLanguageOTAV2Supported`: la OTA de idioma es una variante de la OTA general (el paquete es un `RobotLanguagePackV2`). Media.
- Local: la app manda `{ "deploymentId" : "localota" }` (`libcore_base.so`; log `SENDING LOCAL OTA DEPLOYMENT ID` en `libcore_jni.so`). Esto parece **disparar** la OTA en el robot; el robot descarga el paquete de la nube (campos `kDeploymentMpkg`, `kDeploymentId`, `kServiceDeploymentId`, `svcEndpoints.svcDeplId`). Baja (el sentido exacto no está confirmado).
- Nube: `/v1/%s/request-ota?app_id=%s` y `{"requestOta":"`; serializadores `RequestOtaAwsSerializer` y `RequestOtaAxedaSerializer` (`libcore_base.so`). Media.
- Descubrimiento de la nube: `https://disc-%s.iot.irobotapi.com/v1/discover/endpoints?country_code=%s` y `.../v1/robot/discover/%s` (`libcore_base.so`); `manifest.json` aparece en ambas librerías (formato de paquete con manifiesto; contenido desconocido). Alta (URL), baja (formato).
- Clave de cuenta `GigyaConst::kLocalOtaFeatureSwitchTimeKey`: la OTA local depende además de un interruptor de cuenta. Media.
- No se encontró extensión de archivo, tamaño, firma de paquete ni algoritmo de verificación del paquete de voz (solo hay `SignatureAlgorithm` y "Invalid Signature" en el código de cuenta/Gigya, sin relación demostrada con la OTA).
- Strings de la app (`strings.xml`): `robot_language` "Robot Language", `download_language` "Download Language?", `default_language_pack` "Factory default", `on_demand_ota_update`.
- En el APK no hay archivos de audio ni paquetes de voz (solo iconos y layouts de asistentes de voz tipo Alexa/Google/Siri, que no tienen relación con los altavoces del robot).

## 3. ¿Orden para reproducir un sonido arbitrario?

No se encontró ninguna (cadenas `playSound`, `beep`, `tone`, `chime`, `.wav`, `.mp3`, `.opus` y similares: sin resultados útiles; las únicas `beep` son nombres de textos de ayuda de errores del Braava). `find` existe (`research/protocol-notes.md`, lista de `cmd`) y hace sonar el robot, pero reproduce un sonido fijo del firmware: su payload no admite audio. Confianza alta en que **no hay orden de "reproducir audio"** en el protocolo del cliente; el firmware del robot no se ha analizado.

## 4. ¿Se puede enviar audio propio desde un servidor local?

| Vía | Viabilidad | Motivo |
|---|---|---|
| Comando MQTT local que reproduzca un audio | **No** | No existe en el cliente oficial ni en el protocolo conocido. |
| Cambiar `sLang` a un idioma ya instalado (`dLangs`) | **Sí** (media) | Orden sencilla; cambia la voz del robot, no sirve para audio propio. Afecta a un ajuste visible: avisar antes. |
| Instalar un paquete de voz propio en el hueco `aSlots:1` / `uLangs` por OTA | **Incierta, probablemente no** | El robot descarga de la nube de iRobot un `RobotLanguagePackV2` con manifiesto; habría que (a) conocer el formato, (b) saber si el robot comprueba firma (no hay evidencia), (c) redirigir su descarga a un servidor propio, lo que exige cambiar `cloudEnv`/`sdiscUrl`. (c) está vetado hasta que el usuario dé el paso definitivo. |
| Reproducción en otro dispositivo (altavoz de la base, móvil) | Fuera del robot | Alternativa realista: notificaciones de voz desde el servidor LibreRoomba. |

## Qué falta para avanzar (todo sin tocar el robot)

1. Decompilar con Ghidra 12.1.4 `LanguageSettingImpl::isLanguageOTAV2Supported`, `UpdateUIServiceImpl::attemptLocalOta` y el serializador de `RequestOtaCommand` para ver el JSON exacto que se envía al robot y qué campos del paquete (`RobotLanguagePackV2`) usa la app.
2. Con una sesión de la app oficial: capturar (con permiso del usuario) qué ve el robot en `deploymentState` / `langs2` durante una descarga de idioma. Esto es una prueba con robot: va a `pending-robot-tests.md` y queda para cuando el usuario diga que hay acceso.
3. Lectura de la API de la nube que ya consulta la app con la cuenta del usuario, solo lectura, sin modificarla (a decidir con el usuario).
