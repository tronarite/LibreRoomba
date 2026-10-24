# Inventario extraído de libcore_base.so / libcore_jni.so (2026-10-24, `strings -a`)
Nombres de símbolos C++ (`RoombaSchemaField::k*`, `CommandId::k*`). Los nombres JSON exactos hay que confirmarlos con pseudocódigo (REA) o probando en el robot. Nada de esto está probado salvo lo marcado en protocol-notes.md.

## Órdenes (CommandId)
Control/ajustes: SetBinPause, SetBinTypeDetect, SetChildLock, SetCleaningPower, SetCutHeight, SetDisplayLight, SetGentleMode, SetNavStrategy, SetODOAMode, SetSuctionLevel, SetRobotPadWetness, SetRobotPadPlateWetness, SetImageUpload, SetChargingLightRightPattern, TileScanModeAllowed, PMapLearningAllowed, PMapContinuousLearningAllowed, BleDeviceLocalizationAllowed, WifiDeviceLocalizationAllowed, SetAQIScale, SetSmartHomeSettings.
Identidad/hora/idioma: SetName, SetRobotLanguageV2, SetCountryCode, SetTimeZone, SetLocalTimeOffset, SetUtcTime, SetNtpHosts, SetRegDate, SetPassword, GetPassword, GetSerialNumberData.
Nube/red (CUIDADO): SetCloudEnv, SetServiceDiscoveryUrl, SetWifiConfig, EnableSoftAp, WifiActivate, CheckSsid, GetNetworkInfo, Associate, Authenticate, LogUpload.
Consulta: GetMissionHistory, GetMissionImageMetadata, GetTimeEstimates, GetEpoch, GetRobotParts, GetNotifications, GetThingShadow, GetSurveyData.
Mantenimiento/otros: ResetRobot, ResetRobotParts, StartOnDemandOta, StartMatterCommissioning, Teaming* (varios).

## Estado reportado (RoombaSchemaField)
Audio: Audio, AudioVersion, AvailableLanguages, Language, LanguageV2.
Base/evacuación: EvacAllowed, Evacs, EDock, DockKnown, BinFull, BinPresent, BinType, PadWetness, PadDirtyPause, PadDryAllowed, PadWashAfter, FlushSluice, NumTanks.
Misión: MissionId, MissionStatus, Phase, Cycle, NMssn, MssnM, RunM, RechrgM, ChrgM, Sqft, Dirt, BlackBoxMissionData, BlackBoxRunData, RuntimeStatistics, Timeline, LastCommand, PreventativeMaintenance.
Mapas: Pmaps, PmapsInfo, V4maps, Omaps, UmfLayer, Pose, Position, Theta, X, Y, SmartClean*, MapIdReq, PMapVersions, Saves.
Nube/red: AwsCloudEnvironment, ServiceEndpoints, ServiceDeploymentId, DeploymentId, DiscoveryData, NetworkInformation, WifiConfiguration, WifiSignal*, RaaS, StreamingVideoStatus, MatterCommisioning, TeamingStatus.
Ajustes: BinPause, CarpetBoost, VacuumHigh, SuctionLevel, TwoPass, NoAutoPasses, NoPersistentPasses, RankOverlap, EdgeClean, GentleMode, NavStrategy, ODOAMode, OdoaLite, ChildLock, EcoCharge, ChargingLightPattern, DisplayLight, CleanSchedule, ScheduleOnHold, RobotName, TimeZone, SKU, SoftwareVersion.
