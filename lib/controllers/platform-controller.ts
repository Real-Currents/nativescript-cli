import { NativePlatformStatus } from "../constants";
import * as path from "path";

export class PlatformController implements IPlatformController {
	constructor(
		private $addPlatformService: IAddPlatformService,
		private $errors: IErrors,
		private $fs: IFileSystem,
		private $logger: ILogger,
		private $packageInstallationManager: IPackageInstallationManager,
		private $projectDataService: IProjectDataService,
		private $platformsDataService: IPlatformsDataService,
		private $projectChangesService: IProjectChangesService,
	) { }

	public async addPlatform(addPlatformData: IAddPlatformData): Promise<void> {
		const [platform, version] = addPlatformData.platform.toLowerCase().split("@");
		const projectData = this.$projectDataService.getProjectData(addPlatformData.projectDir);
		const platformData = this.$platformsDataService.getPlatformData(platform, projectData);
		const frameworkPath = '/home/revlin/Public/android/nativescript/android-runtime/dist';

		addPlatformData.frameworkPath = frameworkPath;

		this.$logger.trace(`Creating NativeScript project for the ${platform} platform`);
		this.$logger.trace(`Path: ${platformData.projectRoot}`);
		this.$logger.trace(`Package: ${projectData.projectIdentifiers[platform]}`);
		this.$logger.trace(`Name: ${projectData.projectName}`);

		this.$logger.trace(`Platform info:`);
		this.$logger.trace(`Framework: ${addPlatformData.frameworkPath}`);
		this.$logger.trace(`Version: ${version}`);

		this.$logger.info("Copying template files...");

		const packageToInstall = await this.getPackageToInstall(platformData, projectData, addPlatformData.frameworkPath, version);
		this.$logger.trace(JSON.stringify(addPlatformData, function (m: any, r) {
			const cache: any[] = [];
			let message: any = m;
			if (typeof m === 'object') try {
				message = JSON.stringify(m, function (key, value) {
					if ((typeof value === 'object') && (value !== null)) {
						if (cache.indexOf(value) !== -1) {
							/* Circular reference found, discard key */
							return;
						}
						/* Store value in our collection */
						cache.push(value);
					}
					return value;
				});
			} catch (e) {
				console.debug(  "Could not stringify object or value:\n"+ e.message +"\n" );
				message = m;
			} finally {
				if (typeof message !== "string") message = m;
			}

			if (typeof message === 'boolean') message = m + "";

			if ((r !== undefined) && (typeof r.replace === 'function') && (typeof message === 'string'))
				message = r.replace(/\$1/, message);

			try {
				console.debug(message);
				console.debug();
			} catch (e) {
				//alert( message );
			} finally {
				return message;
			}

			return message;
		}));

		const installedPlatformVersion = await this.$addPlatformService.addPlatformSafe(projectData, platformData, packageToInstall, addPlatformData.nativePrepare);

		this.$fs.ensureDirectoryExists(path.join(projectData.platformsDir, platform));
		this.$logger.info(`Platform ${platform} successfully added. v${installedPlatformVersion}`);
	}

	public async addPlatformIfNeeded(addPlatformData: IAddPlatformData): Promise<void> {
		const [platform] = addPlatformData.platform.toLowerCase().split("@");
		const projectData = this.$projectDataService.getProjectData(addPlatformData.projectDir);
		const platformData = this.$platformsDataService.getPlatformData(platform, projectData);

		const shouldAddPlatform = this.shouldAddPlatform(platformData, projectData, addPlatformData.nativePrepare);
		if (shouldAddPlatform) {
			await this.addPlatform(addPlatformData);
		}
	}

	private async getPackageToInstall(platformData: IPlatformData, projectData: IProjectData, frameworkPath?: string, version?: string): Promise<string> {
		let result = null;
		if (frameworkPath) {
			if (!this.$fs.exists(frameworkPath)) {
				this.$errors.fail(`Invalid frameworkPath: ${frameworkPath}. Please ensure the specified frameworkPath exists.`);
			}
			result = path.resolve(frameworkPath);
		} else {
			if (!version) {
				const currentPlatformData = this.$projectDataService.getNSValue(projectData.projectDir, platformData.frameworkPackageName);
				version = (currentPlatformData && currentPlatformData.version) ||
					await this.$packageInstallationManager.getLatestCompatibleVersion(platformData.frameworkPackageName);
			}

			result = `${platformData.frameworkPackageName}@${version}`;
		}

		return result;
	}

	private shouldAddPlatform(platformData: IPlatformData, projectData: IProjectData, nativePrepare: INativePrepare): boolean {
		const platformName = platformData.platformNameLowerCase;
		const hasPlatformDirectory = this.$fs.exists(path.join(projectData.platformsDir, platformName));
		const shouldAddNativePlatform = !nativePrepare || !nativePrepare.skipNativePrepare;
		const prepareInfo = this.$projectChangesService.getPrepareInfo(platformData);
		const requiresNativePlatformAdd = prepareInfo && prepareInfo.nativePlatformStatus === NativePlatformStatus.requiresPlatformAdd;
		const result = !hasPlatformDirectory || (shouldAddNativePlatform && requiresNativePlatformAdd);

		return !!result;
	}
}
$injector.register("platformController", PlatformController);
