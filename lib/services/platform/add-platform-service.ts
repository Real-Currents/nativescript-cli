import * as path from "path";
import { PROJECT_FRAMEWORK_FOLDER_NAME, TrackActionNames, AnalyticsEventLabelDelimiter } from "../../constants";
import { performanceLog } from "../../common/decorators";

export class AddPlatformService implements IAddPlatformService {
	constructor(
		private $fs: IFileSystem,
		private $logger: ILogger,
		private $pacoteService: IPacoteService,
		private $projectDataService: IProjectDataService,
		private $terminalSpinnerService: ITerminalSpinnerService,
		private $analyticsService: IAnalyticsService,
		private $tempService: ITempService
	) { }

	public async addPlatformSafe(projectData: IProjectData, platformData: IPlatformData, packageToInstall: string, nativePrepare: INativePrepare): Promise<string> {
		const spinner = this.$terminalSpinnerService.createSpinner();

		try {
			spinner.start();

			const frameworkDirPath = await this.extractPackage(packageToInstall);
			this.$logger.trace(frameworkDirPath);
			const frameworkPackageJsonContent = this.$fs.readJson(path.join(frameworkDirPath, "..", "package.json"));
			this.$logger.trace(frameworkPackageJsonContent);
			const frameworkVersion = frameworkPackageJsonContent.version;

			await this.setPlatformVersion(platformData, projectData, frameworkVersion);
			await this.trackPlatformVersion(frameworkVersion, platformData);

			if (!nativePrepare || !nativePrepare.skipNativePrepare) {
				await this.addNativePlatform(platformData, projectData, frameworkDirPath, frameworkVersion);
			}

			return frameworkVersion;
		} catch (err) {
			const platformPath = path.join(projectData.platformsDir, platformData.platformNameLowerCase);
			this.$fs.deleteDirectory(platformPath);
			throw err;
		} finally {
			spinner.stop();
		}
	}

	public async setPlatformVersion(platformData: IPlatformData, projectData: IProjectData, frameworkVersion: string): Promise<void> {
		const frameworkPackageNameData = { version: frameworkVersion };
		this.$projectDataService.setNSValue(projectData.projectDir, platformData.frameworkPackageName, frameworkPackageNameData);
	}

	private async extractPackage(pkg: string): Promise<string> {
		this.$logger.trace(pkg);
		const downloadedPackagePath = await this.$tempService.mkdirSync("runtimeDir");
		if (this.$fs.exists(pkg)) {
			const frameworkDir = path.join(downloadedPackagePath, "dist", PROJECT_FRAMEWORK_FOLDER_NAME);
			await this.$fs.copyFile(pkg, downloadedPackagePath);
			return path.resolve(frameworkDir);
		} else {
			const frameworkDir = path.join(downloadedPackagePath, PROJECT_FRAMEWORK_FOLDER_NAME);
			await this.$pacoteService.extractPackage(pkg, downloadedPackagePath);
			return path.resolve(frameworkDir);
		}
	}

	@performanceLog()
	private async addNativePlatform(platformData: IPlatformData, projectData: IProjectData, frameworkDirPath: string, frameworkVersion: string): Promise<void> {
		const platformDir = path.join(projectData.platformsDir, platformData.normalizedPlatformName.toLowerCase());
		this.$fs.deleteDirectory(platformDir);

		await platformData.platformProjectService.createProject(path.resolve(frameworkDirPath), frameworkVersion, projectData);
		platformData.platformProjectService.ensureConfigurationFileInAppResources(projectData);
		await platformData.platformProjectService.interpolateData(projectData);
		platformData.platformProjectService.afterCreateProject(platformData.projectRoot, projectData);
	}

	private async trackPlatformVersion(frameworkVersion: string, platformData: IPlatformData): Promise<void> {
		await this.$analyticsService.trackEventActionInGoogleAnalytics({
			action: TrackActionNames.AddPlatform,
			additionalData: `${platformData.platformNameLowerCase}${AnalyticsEventLabelDelimiter}${frameworkVersion}`
		});
	}
}
$injector.register("addPlatformService", AddPlatformService);
