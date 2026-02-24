import { Component, OnInit, OnDestroy, ViewChild, ElementRef, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { LabelSettings } from '@progress/kendo-angular-progressbar';
import { Subscription, timeout } from 'rxjs';
import { MediaDetailService } from '../../_services/media-detail.service';
import { JobCutService } from '../../_services/job-cut.service';
import { TypeYoutubeAccountService } from '../../_services/type-youtube-account.service';
import { TypeYoutubeVisibilityService } from '../../_services/type-youtube-visibility.service';
import { TypeCutService } from '../../_services/type-cut.service';
import { GraphicImageService } from '../../_services/graphic-image.service';
import { DropDownFilterSettings } from "@progress/kendo-angular-dropdowns";
import { ETypeStatusClip } from '../../_helpers/enum-status-clip';
import { StorageService } from '../../_services/storage.service';

@Component({
  selector: 'app-video-player',
  templateUrl: './video-player.component.html',
  styleUrls: ['./video-player.component.css']
})
export class VideoPlayerComponent implements OnInit, OnDestroy, OnChanges {

  // Propiedades de video player
  @Input() selectedMediaItem: any = null;
  @Input() user: any = null;
  @Input() showYoutubeSection: boolean = false;
  @Input() voiceover: boolean = false;
  @Input() mediaDetails: any[] = [];
  @Input() useSam: boolean = false; // Nuevo input para indicar si usar SAM
  @Input() tokenSam: string = ''; // Token SAM cuando se usa SAM
  @Output() videoLoaded = new EventEmitter<any>();
  @Output() cutsGenerated = new EventEmitter<any>();
  @Output() mediaItemChanged = new EventEmitter<any>();

  // Configuración del reproductor
  public videoSource: any;
  public videoName: any;
  public videoHeight: number = 230;

  // Estado de reproducción
  public videoProgress: number = 0;
  public isPlaying = false;
  public isMuted = false;
  public iconPlayPause = 'play';
  public titlePlayPause = 'Reproducir';
  public iconMuteUnmute = 'volume-up';

  // Información del video
  public currentTimecode = '00:00:00:00';
  public totalDuration = '00:00:00:00';
  public currentFrame: number = 0;
  public playbackPercent: number = 0;
  public fps: number = 30;

  // Configuración de controles
  public progressLabelSettings: LabelSettings = {
    visible: false,
  };
  public stepFrames = 10;
  public maxSpeed = 16;
  public normalSpeed = 1;

  // Reproducción hacia atrás
  public backwardAnimationFrameId: number | null = null;
  public lastBackwardTimestamp: number | null = null;
  public backwardSpeed = 1;
  public maxBackwardSpeed = 16;
  public bFastBackward = false;

  // Animaciones y cortes
  public cutPlaybackAnimationId: number | null = null;

  // Grid de cortes
  public cutsGridData: any[] = [];
  public cuts: { order: number; start: number; end: number; mediaDetailId: number; mediaDetailVoiceId: number; fps: number | null; transition: boolean; active: boolean }[] = [];

  // Marcadores de corte
  public cutStart: number | null = null;
  public cutEnd: number | null = null;
  public activeCut: { start: number; end: number } | null = null;

  // Reproducción de secuencias
  public currentCutIndex: number = -1;
  private _sequencePlaying: boolean = false;
  public activeCutIndex: number = -1;
  public activeCutIcon: string = 'video-external';
  public lastCutCompleted: boolean = false;
  public selectedRowId: any;

  private pendingPlaySegmentCallback: (() => void) | null = null;
  private isPlaySegmentInProgress: boolean = false;

  public get sequencePlaying(): boolean {
    return this._sequencePlaying;
  }

  public set sequencePlaying(value: boolean) {
    this._sequencePlaying = value;
  }

  // Configuración de tipos de corte
  public selectedTypeCut: any = null;
  public selectedGraphicImage: any = null;
  public typeCutOptions: any[] = [];
  public graphicImageOptions: any[] = [];
  public filteredGraphicImageOptions: any[] = [];
  private typeCutData: any[] = [];
  private graphicImageData: any[] = [];
  private pendingMediaItem: any = null;

  // Propiedades youtube
  public publishToYoutube: boolean = false;
  public youtubeVideoName: string = '';
  public youtubeAccount: any = null;
  public youtubeDescription: string = '';
  public youtubeKeywords: string = '';
  public youtubeVisibility: any = null;
  public youtubeAccounts: any[] = [];
  public youtubeVisibilityOptions: any[] = [];
  private youtubeAccountsData: any[] = [];
  private youtubeVisibilityData: any[] = [];

  // Propiedades voice-over
  public voiceoverFiles: any[] = [];
  private currentAudioFileId: number | null = null;
  private blobUrl: string = '';
  public loadingAudioIds: Set<number> = new Set();

  // Drag & Drop para archivos
  private draggedItem: any | null = null;
  public isDragOver: boolean = false;
  public filterVoiceoverFiles: DropDownFilterSettings = {
    caseSensitive: false,
    operator: "contains",
  };

  // Diálogo de progreso
  public progressDialogOpened: boolean = false;
  public progressPercentage: number = 0;
  public progressMessage: string = '';
  public isProcessingComplete: boolean = false;
  public processingError: boolean = false;
  public clipUrl: string = '';
  public youtubeUrl: string = '';
  private progressInterval: any;
  private currentJobCutId: number | null = null;

  @ViewChild('videoPlayer', { static: false }) videoPlayer: ElementRef;
  @ViewChild('sourceVideo', { static: false }) sourceVideo: ElementRef;
  @ViewChild('videoContainer', { static: false }) videoContainer: ElementRef;

  public interval: any;
  public mediaDetailAudioSubscription: Subscription;
  public audioStateSubscription: Subscription;

  private resizeObserver: ResizeObserver;
  private audioEl = this.mediaDetailService.getAudioElement();

  constructor(
    private mediaDetailService: MediaDetailService,
    private jobCutService: JobCutService,
    private typeYoutubeAccountService: TypeYoutubeAccountService,
    private typeYoutubeVisibilityService: TypeYoutubeVisibilityService,
    private typeCutService: TypeCutService,
    private graphicImageService: GraphicImageService,
  ) { }

  ngOnInit(): void {
    if (this.selectedMediaItem) {
      this.selectedRowId = this.selectedMediaItem.id;
    }

    this.loadYoutubeAccounts();
    this.loadYoutubeVisibilityOptions();
    this.loadTypeCutOptions();
    this.loadGraphicImageOptions();
    this.loadVoiceoverFiles();

    this.audioStateSubscription = this.mediaDetailService.audioState$.subscribe(state => {
        this.updateGridAudioStatus(state.id, state.isPlaying, state.isReset || false);
    });
  }

  ngAfterViewInit() {
    this.initVideoResize();
    if (this.videoPlayer && this.videoPlayer.nativeElement) {
      this.videoPlayer.nativeElement.addEventListener('error', (error) => {
        console.error('Error en el elemento de video:', error);
        alert('Error al cargar o reproducir el video. El archivo puede estar dañado o no ser compatible.');
      });
    }

    if (this.pendingMediaItem) {
      this.changeVideo(this.pendingMediaItem);
      this.pendingMediaItem = null;
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selectedMediaItem'] && changes['selectedMediaItem'].currentValue) {
      const newMedia = changes['selectedMediaItem'].currentValue;
      const isUserSelection = !changes['selectedMediaItem'].firstChange;

      if (this.isPlaySegmentInProgress) {
        return;
      }

      if (changes['selectedMediaItem'].firstChange || isUserSelection) {
        this.selectedRowId = newMedia.id;

        if (!this.videoPlayer || !this.videoPlayer.nativeElement) {
          setTimeout(() => {
            if (this.videoPlayer && this.videoPlayer.nativeElement) {
              this.changeVideo(newMedia);
            }
          }, 100);
        } else {
          this.changeVideo(newMedia);
        }
      }
    }

    // if (changes['voiceover'] && !changes['voiceover'].firstChange) {
    //   this.loadVoiceoverFiles();
    // }
  }

  ngOnDestroy(): void {
    if (this.interval) clearInterval(this.interval);
    if (this.progressInterval) clearInterval(this.progressInterval);
    if (this.mediaDetailAudioSubscription) this.mediaDetailAudioSubscription.unsubscribe();
    if (this.resizeObserver) this.resizeObserver.disconnect();
    this.stopBackwardPlayback();
    if (this.cutPlaybackAnimationId) cancelAnimationFrame(this.cutPlaybackAnimationId);
    this.stopAllVoiceoverPlayback();
    if (this.blobUrl){
      URL.revokeObjectURL(this.blobUrl);
    }
  }

  // Cargar cuentas de YouTube
  private loadYoutubeAccounts(): void {
    this.typeYoutubeAccountService.getListTypeYoutubeAccount().subscribe({
      next: (data) => {
        this.youtubeAccountsData = JSON.parse(data);
        this.youtubeAccounts = this.youtubeAccountsData
          .filter(account => account.active)
          .map(account => ({
            text: account.name,
            value: account.id
          }));
      },
      error: (err) => {
        console.error('Error loading YouTube accounts:', err);
        this.youtubeAccounts = [];
      }
    });
  }

  // Cargar opciones de visibilidad de YouTube 
  private loadYoutubeVisibilityOptions(): void {
    this.typeYoutubeVisibilityService.getListTypeYoutubeVisibility().subscribe({
      next: (data) => {
        this.youtubeVisibilityData = JSON.parse(data);
        this.youtubeVisibilityOptions = this.youtubeVisibilityData
          .filter(visibility => visibility.active)
          .map(visibility => ({
            text: visibility.name,
            value: visibility.id
          }));
      },
      error: (err) => {
        console.error('Error loading YouTube visibility options:', err);
        this.youtubeVisibilityOptions = [];
      }
    });
  }

  // Cargar opciones de tipo de corte
  private loadTypeCutOptions(): void {
    this.typeCutService.getListTypeCutsActive().subscribe({
      next: (data) => {
        this.typeCutData = JSON.parse(data);
        this.typeCutOptions = this.typeCutData
          .filter(typeCut => typeCut.active)
          .map(typeCut => ({
            text: typeCut.name,
            value: typeCut.id
          }));
      },
      error: (err) => {
        console.error('Error loading type cut options:', err);
        this.typeCutOptions = [];
      }
    });
  }

  // Cargar opciones de imagen gráfica
  private loadGraphicImageOptions(): void {
    this.graphicImageService.getListGraphicImageActive().subscribe({
      next: (data) => {
        this.graphicImageData = JSON.parse(data);
        this.graphicImageOptions = this.graphicImageData
          .filter(image => image.active)
          .map(image => ({
            text: image.name,
            value: image.name
          }));
        this.filterGraphicImagesByTypeCut();
      },
      error: (err) => {
        console.error('Error loading graphic image options:', err);
        this.graphicImageOptions = [];
      }
    });
  }

  private loadVoiceoverFiles(): void {
    this.voiceoverFiles = [];
  }

  // Cambiar video cargado
  changeVideo(dataItem: any): void {
    this.cutStart = null;
    this.cutEnd = null;
    this.lastCutCompleted = false;
    this.sequencePlaying = false;
    this.currentCutIndex = -1;
    this.activeCutIndex = -1;

    this.selectedMediaItem = dataItem;
    this.selectedRowId = dataItem.id;

    if (!this.videoPlayer || !this.videoPlayer.nativeElement) {
      return;
    }

    const videoEl = this.videoPlayer.nativeElement;

    if (!videoEl.paused) {
      videoEl.pause();
    }

    this.stopAllVoiceoverPlayback();

    videoEl.onloadeddata = null;
    videoEl.onloadedmetadata = null;
    videoEl.onerror = null;

    videoEl.src = '';
    videoEl.removeAttribute('src');
    if (this.sourceVideo && this.sourceVideo.nativeElement) {
      this.sourceVideo.nativeElement.src = '';
      this.sourceVideo.nativeElement.removeAttribute('src');
    }
    videoEl.load();

    if (this.cutPlaybackAnimationId) {
      cancelAnimationFrame(this.cutPlaybackAnimationId);
      this.cutPlaybackAnimationId = null;
    }

    const videoObservable = this.useSam
      ? this.mediaDetailService.getVideoProxySam(dataItem.id, this.tokenSam)
      : this.mediaDetailService.getVideoProxy(dataItem.id);

    videoObservable.subscribe({
      next: (blob) => {
        const videoUrl = URL.createObjectURL(blob);

        const previousVideoSource = this.videoSource;

        this.videoSource = videoUrl;
        this.videoName = dataItem.title;
        this.fps = dataItem.fps || 30;
        setTimeout(() => {
          if (this.videoPlayer && this.videoPlayer.nativeElement) {
            this.videoPlayer.nativeElement.src = this.videoSource;
            if (this.sourceVideo && this.sourceVideo.nativeElement) {
              this.sourceVideo.nativeElement.src = this.videoSource;
            }

            this.videoPlayer.nativeElement.load();

            this.videoLoaded.emit(dataItem);

            const onVideoLoaded = () => {

              if (previousVideoSource && previousVideoSource !== videoUrl) {
                URL.revokeObjectURL(previousVideoSource);
              }

              if (this.pendingPlaySegmentCallback) {
                const callback = this.pendingPlaySegmentCallback;
                this.pendingPlaySegmentCallback = null;
                this.isPlaySegmentInProgress = false;
                callback();
                return;
              }

              this.videoPlayer.nativeElement.play().then(() => {
                this.isPlaying = true;
                this.iconPlayPause = 'pause';
                this.titlePlayPause = 'Pausar';
              }).catch((error) => {
                console.warn('Error al reproducir el video:', error);
                alert('No se pudo reproducir el video. Verifique que el archivo no esté dañado o intente nuevamente.');
              });

              this.videoPlayer.nativeElement.removeEventListener('loadeddata', onVideoLoaded);
            };

            this.videoPlayer.nativeElement.addEventListener('loadeddata', onVideoLoaded, { once: true });
          }
        }, 100);
      },
      error: (error) => {
        console.error('Error cargando video:', error);

        if (error.error instanceof Blob) {
          const reader = new FileReader();
          reader.onload = () => {
            const errorMsg = reader.result?.toString() || 'Error al cargar el video.';
            alert(errorMsg);
          };
          reader.readAsText(error.error);
        } else {
          alert('No se pudo cargar el video. Verifique su conexión o intente más tarde.');
        }
      }
    });
  }

  // Actualizar información del video
  onTimeUpdate(): void {
    const duration = this.videoPlayer.nativeElement.duration;
    const currentTime = this.videoPlayer.nativeElement.currentTime;

    if (duration && !isNaN(duration)) {
      this.videoProgress = (currentTime / duration) * 100;
      this.currentTimecode = this.formatTimecode(currentTime, this.fps);
      this.totalDuration = this.formatTimecode(duration, this.fps);
      this.currentFrame = Math.round(currentTime * this.fps);
      this.playbackPercent = Math.round((currentTime / duration) * 100);
    }
  }

  // Formatear frames
  formatTimecode(seconds: number, fps: number): string {
    if (!isFinite(seconds) || seconds < 0) {
      return '00:00:00:00';
    }
    const totalFrames = Math.round(seconds * fps);

    const hours = Math.floor(totalFrames / (3600 * fps));
    const minutes = Math.floor((totalFrames % (3600 * fps)) / (60 * fps));
    const secs = Math.floor((totalFrames % (60 * fps)) / fps);
    const frames = totalFrames % Math.round(fps);

    const pad = (num: number, size: number = 2) => num.toString().padStart(size, "0");

    return `${pad(hours)}:${pad(minutes)}:${pad(secs)}:${pad(frames)}`;
  }

  // Formatear duración en segundos
  formatDuration(seconds: number): string {
    if (!seconds || isNaN(seconds)) return '00:00';

    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    const paddedHrs = hrs.toString().padStart(2, '0');
    const paddedMins = mins.toString().padStart(2, '0');
    const paddedSecs = secs.toString().padStart(2, '0');

    if (hrs > 0) {
      return `${paddedHrs}:${paddedMins}:${paddedSecs}`;
    } else {
      return `${paddedMins}:${paddedSecs}`;
    }
  }

  // Reproducir/pausar video
  playPause(): void {
    const video = this.videoPlayer.nativeElement;
    this.clearTemporaryMarkers();

    if (this.bFastBackward) {
      this.stopBackwardPlayback();
    }

    if (video.paused) {
      video.play().then(() => {
        this.isPlaying = true;
        this.iconPlayPause = 'pause';
        this.titlePlayPause = 'Pausar';
      }).catch((error) => {
        console.error('Error al reproducir el video:', error);
        alert('No se pudo reproducir el video. Verifique que el archivo no esté dañado o intente nuevamente.');
        this.isPlaying = false;
        this.iconPlayPause = 'play';
        this.titlePlayPause = 'Reproducir';
      });
    } else {
      video.pause();
      this.isPlaying = false;
      this.iconPlayPause = 'play';
      this.titlePlayPause = 'Reproducir';

      this.stopAllVoiceoverPlayback();
    }
  }

  // Adelantar frames
  seekForward(): void {
    const video = this.videoPlayer.nativeElement;
    this.clearTemporaryMarkers();
    const seconds = this.stepFrames / this.fps;
    video.currentTime = Math.min(video.duration, video.currentTime + seconds);
  }

  // Retroceder frames  
  seekBackward(): void {
    const video = this.videoPlayer.nativeElement;
    this.clearTemporaryMarkers();
    const seconds = this.stepFrames / this.fps;
    video.currentTime = Math.max(0, video.currentTime - seconds);
  }

  // Configurar paso de frames
  setStep(frames: number): void {
    this.stepFrames = frames;
  }

  // Avance rápido
  videoFastForward(): void {
    const video = this.videoPlayer.nativeElement;

    this.clearTemporaryMarkers();

    if (this.bFastBackward) {
      this.stopBackwardPlayback();
    }

    if (video.paused) {
      video.play();
    }
    if (video.playbackRate < this.maxSpeed) {
      video.playbackRate *= 2;
    } else {
      video.playbackRate = this.normalSpeed;
    }

    this.isPlaying = true;
    this.iconPlayPause = 'pause';
    this.titlePlayPause = 'Pausar';
  }

  // Restablecer velocidad normal
  videoResetSpeed(): void {
    const video = this.videoPlayer.nativeElement;
    video.playbackRate = this.normalSpeed;
    this.stopBackwardPlayback();
  }

  // Retroceso rápido
  videoFastBackward(): void {
    const video = this.videoPlayer.nativeElement as HTMLVideoElement;

    this.clearTemporaryMarkers();

    video.playbackRate = this.normalSpeed;

    if (this.backwardSpeed < this.maxBackwardSpeed) {
      this.backwardSpeed *= 2;
    } else {
      this.backwardSpeed = 1;
    }

    if (!video.paused) {
      video.pause();
    }

    this.bFastBackward = true;
    if (!this.backwardAnimationFrameId) {
      this.startBackwardLoop();
    }
  }

  // Iniciar bucle de retroceso
  private startBackwardLoop(): void {
    const video = this.videoPlayer.nativeElement as HTMLVideoElement;
    if (!video) return;

    video.pause();
    this.isPlaying = true;
    this.iconPlayPause = 'pause';
    this.titlePlayPause = 'Pausar';

    this.lastBackwardTimestamp = performance.now();

    const step = (timestamp: number) => {
      if (!this.bFastBackward || !video) {
        this.backwardAnimationFrameId = null;
        return;
      }

      if (this.lastBackwardTimestamp !== null) {
        const elapsed = (timestamp - this.lastBackwardTimestamp) / 1000;
        const deltaTime = elapsed * this.backwardSpeed;

        video.currentTime = Math.max(0, video.currentTime - deltaTime);

        if (video.currentTime <= 0) {
          this.stopBackwardPlayback();
          return;
        }
      }

      this.lastBackwardTimestamp = timestamp;
      this.backwardAnimationFrameId = requestAnimationFrame(step);
    };

    this.backwardAnimationFrameId = requestAnimationFrame(step);
  }

  // Detener retroceso rápido
  private stopBackwardPlayback(): void {
    this.bFastBackward = false;
    this.backwardSpeed = 1;
    if (this.backwardAnimationFrameId) {
      cancelAnimationFrame(this.backwardAnimationFrameId);
      this.backwardAnimationFrameId = null;
    }
    this.lastBackwardTimestamp = null;

    const video = this.videoPlayer.nativeElement as HTMLVideoElement;
    if (video && video.paused) {
      this.isPlaying = false;
      this.iconPlayPause = 'play';
      this.titlePlayPause = 'Reproducir';
    }
  }

  // Reiniciar video
  restart(): void {
    this.clearTemporaryMarkers();
    this.stopBackwardPlayback();
    this.videoPlayer.nativeElement.currentTime = 0;
    this.videoPlayer.nativeElement.load();
    this.videoPlayer.nativeElement.play();
    this.isPlaying = true;
    this.iconPlayPause = 'pause';
    this.titlePlayPause = 'Pausar';
    this.currentTimecode = '00:00:00:00';
  }

  // Buscar posición en el video
  seek(event: any): void {
    if (this.bFastBackward) {
      this.stopBackwardPlayback();
    }
    const progressBar = event.target.getBoundingClientRect();
    const clickPosition = event.clientX - progressBar.left;
    const percentage = (clickPosition / progressBar.width) * 100;
    const duration = this.videoPlayer.nativeElement.duration;
    this.videoPlayer.nativeElement.currentTime = (percentage / 100) * duration;
    this.videoProgress = percentage;
  }

  // Silenciar/activar audio
  muteUnmute(): void {
    this.videoPlayer.nativeElement.muted = !this.videoPlayer.nativeElement.muted;
    this.isMuted = this.videoPlayer.nativeElement.muted;
    this.iconMuteUnmute = this.isMuted ? 'volume-off' : 'volume-up';
  }

  // Limpiar marcadores de cortes
  clearTemporaryMarkers(): void {
    if (this.lastCutCompleted) {
      this.cutStart = null;
      this.cutEnd = null;
      this.lastCutCompleted = false;
    }
  }

  // Marcar inicio de corte
  markCutStart(): void {
    if (this.sequencePlaying) {
      return;
    }
    if (this.activeCut) {
      return;
    }

    this.lastCutCompleted = false;
    this.cutStart = this.videoPlayer.nativeElement.currentTime;
    this.cutEnd = null;
  }

  // Marcar fin de corte
  markCutEnd(): void {
    if (this.sequencePlaying) {
      return;
    }
    if (this.activeCut) {
      return;
    }

    if (this.cutStart !== null) {
      this.cutEnd = this.videoPlayer.nativeElement.currentTime;

      if (this.cutEnd > this.cutStart) {
        const newCut = {
          order: this.cuts.length + 1,
          start: this.cutStart,
          end: this.cutEnd,
          mediaDetailId: this.selectedMediaItem?.id || 0,
          mediaDetailVoiceId: 0,
          fps: this.fps,
          transition: false,
          active: false
        };

        this.cuts.push(newCut);
        this.refreshGridCuts();
        this.lastCutCompleted = true;
      }
    } else {
      alert('Debe marcar un punto de inicio antes de marcar el fin.');
    }
  }

  // Detener reproducción de secuencias
  private stopPlayback(): void {
    this.sequencePlaying = false;
    this.activeCut = null;
    this.currentCutIndex = -1;
    this.activeCutIndex = -1;
    this.activeCutIcon = 'video-external';

    if (this.cutPlaybackAnimationId) {
      cancelAnimationFrame(this.cutPlaybackAnimationId);
      this.cutPlaybackAnimationId = null;
    }

    this.videoPlayer.nativeElement.pause();
    this.isPlaying = false;
    this.iconPlayPause = 'play';
    this.titlePlayPause = 'Reproducir';
    this.stopBackwardPlayback();
  }

  // Calcular posición del marcador
  getCutLeft(start: number): number {
    if (!this.videoPlayer || !this.videoPlayer.nativeElement.duration) return 0;
    return (start / this.videoPlayer.nativeElement.duration) * 100;
  }

  // Calcular ancho del marcador de corte
  getCutWidth(start: number, end: number): number {
    if (!this.videoPlayer || !this.videoPlayer.nativeElement.duration) return 0;
    return ((end - start) / this.videoPlayer.nativeElement.duration) * 100;
  }

  // Actualizar grid de cortes
  private refreshGridCuts(): void {
    this.cutsGridData = this.cuts.map((cut, index) => ({
      index: index,
      order: cut.order,
      start: this.formatTimecode(cut.start, this.fps),
      end: this.formatTimecode(cut.end, this.fps),
      duration: this.formatTimecode(cut.end - cut.start, this.fps),
      transition: cut.transition,
      active: cut.active
    }));
  }

  // Cambio en transición de corte
  onTransitionChange(index: number, event: any): void {
    if (this.cuts[index]) {
      this.cuts[index].transition = event.target.checked;
    }
  }

  // Reproducir segmento específico
  playSegment(index: number): void {
    const cut = this.cuts[index];
    if (!cut) return;

    if (this.sequencePlaying) {
      return;
    }

    this.clearTemporaryMarkers();

    if (this.activeCut || this.isPlaying) {
      this.stopPlayback();
    }

    this.activeCutIndex = index;
    this.currentCutIndex = index;
    this.activeCut = cut;
    this.sequencePlaying = false;

    const playCut = () => {
      this.startCutPlayback(cut, false);
    };

    if (this.selectedRowId !== cut.mediaDetailId) {
      this.isPlaySegmentInProgress = true;

      const dataItem = this.mediaDetails.find((m: any) => m.id === cut.mediaDetailId);
      if (!dataItem) {
        this.isPlaySegmentInProgress = false;
        return;
      }
      this.selectedRowId = cut.mediaDetailId;
      this.selectedMediaItem = dataItem;
      this.mediaItemChanged.emit(dataItem);
      this.pendingPlaySegmentCallback = playCut;
      this.changeVideo(dataItem);
    } else {
      playCut();
    }
  }

  // Eliminar segmento de corte
  deleteSegment(index: number): void {
    if (index >= 0 && index < this.cuts.length) {
      this.cuts.splice(index, 1);
      this.activeCutIndex = -1;
      this.currentCutIndex = -1;
      this.refreshGridCuts();
    }
  }

  // Reordenar filas del grid de cortes
  public onRowReorder(event: any): void {
    document.body.style.userSelect = 'none';
    if (this.sequencePlaying || this.activeCut) {
      return;
    }

    const draggedRow = event.draggedRows[0];
    const dropTargetRow = event.dropTargetRow;
    const dropPosition = event.dropPosition;
    const fromIndex = this.cutsGridData.findIndex(item => item.index === draggedRow.dataItem.index);
    let toIndex = this.cutsGridData.findIndex(item => item.index === dropTargetRow.dataItem.index);

    if (dropPosition === 'after') {
      toIndex++;
    }
    if (fromIndex < 0 || fromIndex >= this.cuts.length ||
      toIndex < 0 || toIndex > this.cuts.length) {
      return;
    }
    if (toIndex > fromIndex) {
      toIndex--;
    }

    const movedItem = this.cuts.splice(fromIndex, 1)[0];
    this.cuts.splice(toIndex, 0, movedItem);
    this.activeCutIndex = -1;
    this.currentCutIndex = -1;
    this.refreshGridCuts();
  }

  public trackByFn(index: number, item: any): any {
    return item.index;
  }

  // Mover corte hacia arriba
  moveCutUp(index: number): void {
    if (index > 0 && index < this.cuts.length) {
      const temp = this.cuts[index];
      this.cuts[index] = this.cuts[index - 1];
      this.cuts[index - 1] = temp;
      this.refreshGridCuts();
    }
  }

  // Mover corte hacia abajo
  moveCutDown(index: number): void {
    if (index >= 0 && index < this.cuts.length - 1) {
      const temp = this.cuts[index];
      this.cuts[index] = this.cuts[index + 1];
      this.cuts[index + 1] = temp;
      this.refreshGridCuts();
    }
  }

  // Alternar reproducción de secuencia de cortes
  toggleCutsSequence(): void {
    if (this.sequencePlaying) {
      this.stopPlayback();
      return;
    }

    if (this.cuts.length === 0) {
      return;
    }

    this.sequencePlaying = true;
    this.currentCutIndex = 0;
    this.playCutAtIndex(this.currentCutIndex);
  }

  // Cargar video para secuencia
  private loadVideoForSequence(dataItem: any): Promise<void> {

    return new Promise((resolve, reject) => {
      const videoEl = this.videoPlayer.nativeElement;

      if (!videoEl.paused) {
        videoEl.pause();
      }

      if (this.cutPlaybackAnimationId) {
        cancelAnimationFrame(this.cutPlaybackAnimationId);
        this.cutPlaybackAnimationId = null;
      }

      const timeoutId = setTimeout(() => {
        reject(new Error('Timeout loading video'));
      }, 10000);

      const videoObservable = this.useSam
        ? this.mediaDetailService.getVideoProxySam(dataItem.id, this.tokenSam)
        : this.mediaDetailService.getVideoProxy(dataItem.id);

      videoObservable.subscribe({
        next: (blob) => {
          clearTimeout(timeoutId);
          const videoUrl = URL.createObjectURL(blob);

          this.videoSource = videoUrl;
          this.videoName = dataItem.title || 'Video';
          this.fps = dataItem.fps && !isNaN(dataItem.fps) ? dataItem.fps : 30;

          videoEl.src = videoUrl;
          videoEl.load();

          const onMetadataLoaded = () => {
            videoEl.removeEventListener('loadedmetadata', onMetadataLoaded);
            videoEl.removeEventListener('error', onError);

            const duration = videoEl.duration;
            this.totalDuration = this.formatTimecode(duration, this.fps);
            resolve();
          };

          const onError = (error: any) => {
            console.error('Error al cargar video:', error);
            videoEl.removeEventListener('loadedmetadata', onMetadataLoaded);
            videoEl.removeEventListener('error', onError);
            clearTimeout(timeoutId);
            reject(error);
          };

          videoEl.addEventListener('loadedmetadata', onMetadataLoaded);
          videoEl.addEventListener('error', onError);
        },
        error: (error) => {
          clearTimeout(timeoutId);
          console.error('Error obteniendo blob del video:', error);
          reject(error);
        }
      });
    });
  }

  // Reproducir corte en específico
  private playCutAtIndex(index: number): void {

    if (!this.sequencePlaying || index < 0 || index >= this.cuts.length) {
      this.stopPlayback();
      return;
    }

    const cut = this.cuts[index];

    this.activeCutIndex = index;
    this.activeCut = cut;
    this.activeCutIcon = 'eye';

    const playCut = () => {
      this.startCutPlayback(cut, true);
    };

    if (this.selectedRowId !== cut.mediaDetailId) {
      const dataItem = this.mediaDetails.find(m => m.id === cut.mediaDetailId);
      if (!dataItem) {
        this.continueSequence();
        return;
      }

      this.selectedRowId = cut.mediaDetailId;

      this.loadVideoForSequence(dataItem).then(() => {
        playCut();
      }).catch((error) => {
        console.error('Error al cargar video:', error);
        this.continueSequence();
      });
    } else {
      playCut();
    }
  }

  // Iniciar reproducción de corte
  private startCutPlayback(cut: any, isSequence = false): void {

    const video = this.videoPlayer.nativeElement;

    if (!video.paused) {
      video.pause();
      setTimeout(() => {
        this.proceedWithPlayback(cut, video, isSequence);
      }, 50);
    } else {
      this.proceedWithPlayback(cut, video, isSequence);
    }
  }

  private proceedWithPlayback(cut: any, video: HTMLVideoElement, isSequence: boolean): void {
    const expectedVideoSrc = this.videoSource;

    if (video.src !== expectedVideoSrc && expectedVideoSrc) {
      video.src = expectedVideoSrc;
      video.load();

      const onMetadataLoaded = () => {
        video.removeEventListener('loadedmetadata', onMetadataLoaded);
        this.executePlayback(cut, video, isSequence);
      };

      video.addEventListener('loadedmetadata', onMetadataLoaded);
      return;
    }

    this.executePlayback(cut, video, isSequence);
  }

  private executePlayback(cut: any, video: HTMLVideoElement, isSequence: boolean): void {
    if (this.cutPlaybackAnimationId) {
      cancelAnimationFrame(this.cutPlaybackAnimationId);
      this.cutPlaybackAnimationId = null;
    }

    if (this.bFastBackward) {
      this.stopBackwardPlayback();
    }

    if (video.readyState < 2) {
      const onCanPlay = () => {
        video.removeEventListener('canplay', onCanPlay);
        this.performPlayback(cut, video, isSequence);
      };
      video.addEventListener('canplay', onCanPlay);
      return;
    }

    this.performPlayback(cut, video, isSequence);
  }

  private performPlayback(cut: any, video: HTMLVideoElement, isSequence: boolean): void {
    video.currentTime = cut.start;

    if (!video.paused) {
      video.pause();
      setTimeout(() => {
        this.startVideoPlayback(cut, video, isSequence);
      }, 30);
    } else {
      this.startVideoPlayback(cut, video, isSequence);
    }
  }

  // Iniciar reproducción de video
  private startVideoPlayback(cut: any, video: HTMLVideoElement, isSequence: boolean): void {
    video.play().then(() => {
    }).catch((error) => {
      console.error('Error al iniciar reproducción:', error);
      setTimeout(() => {
        video.play().catch((retryError) => {
          console.error('Error en segundo intento:', retryError);
          alert('No se pudo reproducir el segmento de video. Verifique que el archivo no esté dañado.');

          this.isPlaying = false;
          this.iconPlayPause = 'play';
          this.titlePlayPause = 'Reproducir';
          this.activeCutIcon = 'video-external';
          this.activeCutIndex = -1;

          if (isSequence) {
            this.sequencePlaying = false;
          }
        });
      }, 100);
    });

    this.isPlaying = true;
    this.iconPlayPause = 'pause';
    this.titlePlayPause = 'Pausar';
    this.activeCutIcon = 'eye';

    const endPlayback = () => {

      if (this.cutPlaybackAnimationId) {
        cancelAnimationFrame(this.cutPlaybackAnimationId);
        this.cutPlaybackAnimationId = null;
      }

      video.pause();
      this.isPlaying = false;
      this.iconPlayPause = 'play';
      this.titlePlayPause = 'Reproducir';
      this.activeCutIcon = 'video-external';
      this.activeCut = null;

      if (isSequence && this.sequencePlaying) {
        this.continueSequence();
      } else {
        this.activeCutIndex = -1;
      }
    };

    const checkTime = () => {
      if (this.cutPlaybackAnimationId === null) {
        return;
      }

      if (Math.floor(video.currentTime) !== Math.floor(video.currentTime - 0.1)) {
      }

      if (video.currentTime >= cut.end) {
        endPlayback();
      } else {
        this.cutPlaybackAnimationId = requestAnimationFrame(checkTime);
      }
    };

    this.cutPlaybackAnimationId = requestAnimationFrame(checkTime);
  }

  // Continuar secuencia de video
  continueSequence(): void {

    if (!this.sequencePlaying) {
      return;
    }

    this.currentCutIndex++;

    if (this.currentCutIndex < this.cuts.length) {
      setTimeout(() => {
        if (this.sequencePlaying && this.currentCutIndex < this.cuts.length) {
          this.playCutAtIndex(this.currentCutIndex);
        } else {
        }
      }, 500);
    } else {
      this.sequencePlaying = false;
      this.currentCutIndex = -1;
      this.activeCutIndex = -1;
      this.activeCut = null;
      this.activeCutIcon = 'video-external';

      const video = this.videoPlayer.nativeElement;
      if (this.videoSource && video.src !== this.videoSource) {
        video.src = this.videoSource;
        video.load();

        video.addEventListener('loadedmetadata', () => {
        }, { once: true });
      }
    }
  }

  // Cambio en tipo de corte
  onTypeCutChange(): void {
    this.filterGraphicImagesByTypeCut();
  }

  // Verificar imagen gráfica
  shouldShowGraphicImage(): boolean {
    if (!this.selectedTypeCut) {
      return false;
    }

    const selectedTypeCutId = this.getTypeCutId();
    if (selectedTypeCutId === 1) {
      const hasTransitions = this.cuts.some(cut => cut.transition === true);
      return hasTransitions;
    }
    return true;
  }

  isGraphicImageRequired(): boolean {
    return this.shouldShowGraphicImage();
  }

  // Filtrar imágenes gráficas por tipo de corte
  private filterGraphicImagesByTypeCut(): void {
    if (!this.selectedTypeCut) {
      this.filteredGraphicImageOptions = [];
      this.selectedGraphicImage = null;
      return;
    }

    const selectedTypeCutId = this.getTypeCutId();

    if (!selectedTypeCutId) {
      this.filteredGraphicImageOptions = [];
      this.selectedGraphicImage = null;
      return;
    }

    this.filteredGraphicImageOptions = this.graphicImageData
      .filter(image => image.active && image.typeCutId === selectedTypeCutId)
      .map(image => ({
        text: image.name,
        value: image.id
      }));

    if (
      !this.filteredGraphicImageOptions.some(
        option => option.value === this.selectedGraphicImage
      )
    ) {
      this.selectedGraphicImage = null;
    }
  }

  onPublishToYoutubeChange(): void {
    if (!this.publishToYoutube) {
      this.resetYoutubeForm();
    }
  }

  // Obtener total de clips
  get totalClips(): number {
    return this.cuts.length;
  }

  // Obtener resumen del EDL
  public getEdlSummary() {
    const countClips = this.cuts.length;
    const durationSeconds = this.cuts.reduce((total, cut) => total + (cut.end - cut.start), 0);
    const durationFrames = Math.round(durationSeconds * this.fps);

    return {
      countClips,
      durationSeconds: Math.round(durationSeconds),
      durationFrames
    };
  }

  // Guardar cortes realizados
  saveCuts(): void {
    if (this.cuts.length === 0) {
      alert('No hay cortes para enviar.');
      return;
    }

    if (this.publishToYoutube && !this.showYoutubeSection) {
      alert('La publicación en YouTube no está disponible para este tipo de usuario.');
      return;
    }

    if (this.publishToYoutube) {
      if (!this.isYoutubeFormValid()) {
        alert('Complete todos los campos requeridos para YouTube.');
        return;
      }
    }

    if (!this.selectedTypeCut) {
      alert('Seleccione un tipo de corte.');
      return;
    }

    if (this.shouldShowGraphicImage() && !this.selectedGraphicImage) {
      alert('Seleccione una imagen gráfica.');
      return;
    }

    this.sendCutsToServer();
  }

  // Validaciones de YouTube
  private isYoutubeFormValid(): boolean {
    return !!(
      this.youtubeVideoName?.trim() &&
      this.youtubeAccount &&
      this.youtubeDescription?.trim() &&
      this.youtubeKeywords?.trim() &&
      this.youtubeVisibility
    );
  }

  private getYoutubeAccountId(): number {
    const account = this.youtubeAccountsData.find(acc => acc.id === this.youtubeAccount);
    return account ? account.id : 0;
  }

  private getYoutubeVisibilityId(): number {
    const visibility = this.youtubeVisibilityData.find(vis => vis.id === this.youtubeVisibility);
    return visibility ? visibility.id : 0;
  }

  private resetYoutubeForm(): void {
    this.youtubeVideoName = '';
    this.youtubeAccount = null;
    this.youtubeDescription = '';
    this.youtubeKeywords = '';
    this.youtubeVisibility = null;
  }

  // Obtener ID del tipo de corte
  private getTypeCutId(): number {
    const typeCut = this.typeCutData.find(tc => tc.id === this.selectedTypeCut);
    return typeCut ? typeCut.id : 0;
  }

  // Obtener ID de imagen gráfica
  private getGraphicImageId(): number | null {
    if (this.selectedGraphicImage) {
      const imageData = this.graphicImageData.find(i => i.id === this.selectedGraphicImage);
      return imageData ? imageData.id : null;
    }
    return null;
  }

  // Enviar cortes
  private sendCutsToServer(): void {

     if (this.voiceoverFiles.length > 0){
      const mainVoiceFile = this.voiceoverFiles[0];

      this.cuts = this.cuts.map((cut, index) => {
    
      const voiceId = (cut.active && mainVoiceFile) ? mainVoiceFile.id : null; 
      
      return {
        ...cut,
        mediaDetailVoiceId: voiceId
      };
    });
    }

    const cuts = this.cuts.map((cut, index) => ({
      mediaDetailId: cut.mediaDetailId || this.selectedMediaItem?.id,
      mediaDetailVoiceId: cut.mediaDetailVoiceId || null,
      order: index + 1,
      inPoint: this.formatTimecode(cut.start, this.fps),
      outPoint: this.formatTimecode(cut.end, this.fps),
      fps: this.fps.toString(),
      transition: cut.transition
    }));

    const jobCutData: any = {
      cuts: cuts,
      publishYoutube: this.publishToYoutube,
      youtubeVideoName: this.publishToYoutube ? this.youtubeVideoName : null,
      youtubeKeywords: this.publishToYoutube ? this.youtubeKeywords : null,
      youtubeDescription: this.publishToYoutube ? this.youtubeDescription : null,
      typeYoutubeAccountId: this.publishToYoutube ? this.getYoutubeAccountId() : null,
      typeYoutubeVisibilityId: this.publishToYoutube ? this.getYoutubeVisibilityId() : null,
      typeCutId: this.getTypeCutId()
    };

    console.log('cuts', cuts);

    const graphicImageId = this.getGraphicImageId();
    if (graphicImageId !== null) {
      jobCutData.graphicImageId = graphicImageId;
    }

    this.startProgressTracking();

    const saveJobObservable = this.useSam
      ? this.jobCutService.saveJobCutSam(jobCutData, this.tokenSam)
      : this.jobCutService.saveJobCut(jobCutData);

    saveJobObservable.subscribe({
      next: (response) => {
        if (response && (response.id || response.jobCutId)) {
          this.currentJobCutId = response.id || response.jobCutId;
          this.progressMessage = 'Cortes enviados, esperando procesamiento...';
        }
        this.cutsGenerated.emit(jobCutData);
      },
      error: (error) => {
        console.error('Error saving cuts:', error);
        this.handleProgressError('Error al enviar los cortes al servidor.');
      }
    });
  }

  // Restablecer formulario de cortes
  private resetForm(): void {
    this.cuts = [];
    this.cutsGridData = [];
    this.cutStart = null;
    this.cutEnd = null;
    this.activeCut = null;
    this.currentCutIndex = -1;
    this.activeCutIndex = -1;
    this.selectedTypeCut = null;
    this.selectedGraphicImage = null;
    this.publishToYoutube = false;
    this.resetYoutubeForm();
    this.voiceoverFiles = [];
  }

  // Seguimiento de progreso de cortes
  private startProgressTracking(): void {
    this.progressDialogOpened = true;
    this.progressPercentage = 0;
    this.progressMessage = 'Iniciando procesamiento...';
    this.isProcessingComplete = false;
    this.processingError = false;
    this.clipUrl = '';
    this.youtubeUrl = '';

    this.progressInterval = setInterval(() => {
      this.checkJobProgress();
    }, 3000);
  }

  private checkJobProgress(): void {
    if (!this.currentJobCutId) return;

    this.jobCutService.getJobCutById(this.currentJobCutId).subscribe({
      next: (jobCut) => {
        this.updateProgressFromJobCut(jobCut);
      },
      error: (error) => {
        console.error('Error checking job progress:', error);
        this.handleProgressError('Error al verificar el progreso del procesamiento.');
      }
    });
  }

  private updateProgressFromJobCut(jobCut: any): void {
    const status = jobCut.typeStatusClipId;
    const progress = jobCut.progress || 0;

    this.progressPercentage = Math.round(progress);

    switch (status) {
      case ETypeStatusClip.PENDING:
        this.progressMessage = 'En cola para procesamiento...';
        break;
      case ETypeStatusClip.IN_PROGRESS:
        this.progressMessage = `Procesando... ${this.progressPercentage}%`;
        break;
      case ETypeStatusClip.COMPLETED:
        this.progressMessage = '¡Proceso realizado satisfactoriamente!';
        this.progressPercentage = 100;
        this.isProcessingComplete = true;
        this.processingError = false;

        this.extractUrlsFromJobCut(jobCut);

        this.stopProgressTracking();
        this.cleanupAfterCompletion();
        break;
      case ETypeStatusClip.ERROR:
        this.processingError = true;
        this.isProcessingComplete = true;

        if (jobCut.log) {
          this.progressMessage = jobCut.log;
        } else {
          this.progressMessage = 'Error en el procesamiento. Por favor, intente nuevamente.';
        }

        this.stopProgressTracking();
        break;
      default:
        this.progressMessage = 'Estado desconocido...';
        break;
    }
  }

  private extractUrlsFromJobCut(jobCut: any): void {
    this.clipUrl = jobCut.finalUrlShared || '';
    this.youtubeUrl = jobCut.youtubeUrl || '';
  }

  // Error de progreso
  private handleProgressError(message: string): void {
    this.progressMessage = message;
    this.isProcessingComplete = true;
    this.processingError = true;
    this.progressPercentage = 0;
  }

  // Detener seguimiento de progreso
  private stopProgressTracking(): void {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
  }

  private cleanupAfterCompletion(): void {
    this.cuts = [];
    this.cutsGridData = [];
    this.resetYoutubeForm();
    this.resetForm();
    this.currentJobCutId = null;
  }

  // Cerrar diálogo de progreso
  public closeProgressDialog(): void {
    if (!this.isProcessingComplete) {
      const shouldClose = confirm('El procesamiento aún está en curso. ¿Está seguro de que desea cerrar esta ventana? El procesamiento continuará en segundo plano.');
      if (!shouldClose) {
        return;
      }
    }

    this.progressDialogOpened = false;
    this.stopProgressTracking();
    this.resetProgressState();
  }

  // Restablecer estado de progreso
  private resetProgressState(): void {
    this.progressPercentage = 0;
    this.progressMessage = '';
    this.isProcessingComplete = false;
    this.processingError = false;
    this.clipUrl = '';
    this.youtubeUrl = '';
    this.currentJobCutId = null;
  }

  // Abrir URL del clip
  public openClipUrl(): void {
    if (this.clipUrl) {
      window.open(this.clipUrl, '_blank');
    }
  }

  // Abrir URL de YouTube
  public openYoutubeUrl(): void {
    if (this.youtubeUrl) {
      window.open(this.youtubeUrl, '_blank');
    }
  }

  // Tamaño del video
  private initVideoResize(): void {
    if (this.videoContainer) {
      this.resizeObserver = new ResizeObserver(entries => {
        for (const entry of entries) {
          const { width } = entry.contentRect;
          this.updateVideoHeight(width);
        }
      });
      this.resizeObserver.observe(this.videoContainer.nativeElement);
    }
  }

  private updateVideoHeight(containerWidth: number): void {
    const aspectRatio = 9 / 16;
    const newHeight = Math.round(containerWidth * aspectRatio);

    const minHeight = 0;
    const maxHeight = 600;

    this.videoHeight = Math.max(minHeight, Math.min(maxHeight, newHeight));

    if (this.videoPlayer && this.videoPlayer.nativeElement) {
      this.videoPlayer.nativeElement.style.height = `${this.videoHeight}px`;
    }
  }

  // Arrastrar audios
  onDragStart(event: DragEvent, dataItem: any) {
    this.draggedItem = dataItem;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'copy';
      event.dataTransfer.setData('text/plain', JSON.stringify(dataItem));
    }
  }

  onDragEnd(event: DragEvent) {
    this.draggedItem = null;
    this.isDragOver = false;
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
    this.isDragOver = true;
  }

  onDropToListView(event: DragEvent) {
    event.preventDefault();
    this.isDragOver = false;

    if (this.audioEl) {
      this.audioEl.pause();
      this.audioEl.src = '';
    }
    this.currentAudioFileId = null;

    if (this.draggedItem && this.draggedItem.typeAssetId === 2) {
      this.voiceoverFiles = [{
        ...this.draggedItem,
        isPlaying: false
      }];
      
      this.draggedItem = null;
      return;
    }

    try {
      const dropData = event.dataTransfer?.getData('text/plain');
      if (dropData) {
        const audioData = JSON.parse(dropData);

        this.voiceoverFiles = [{
            id: audioData.id,
            title: audioData.title || audioData.fileName || audioData.originalFileName || `Audio ${audioData.id}`,
            durationSeconds: audioData.durationSeconds || 0,
            fileName: audioData.fileName,
            originalFileName: audioData.originalFileName,
            isPlaying: false,
            audioData: audioData
        }];
      }
    } catch (error) {
      console.warn('Error al procesar datos del drag/drop:', error);
    }
  }

  // Eliminar archivo de voice-over seleccionado
  removeFromSelected(product: any) {
    const index = this.voiceoverFiles.findIndex(p => p.id === product.id);
    if (index !== -1) {
      if (this.audioEl && this.audioEl && this.currentAudioFileId === product.id) {
        this.audioEl.pause();
        this.audioEl.currentTime = 0;
        this.mediaDetailService.notifyAudioState(this.currentAudioFileId, false, false);
        this.currentAudioFileId = null;
      }
      this.voiceoverFiles.splice(index, 1);

    }
  }

  // Cambio en switch de voice-over
  onVoiceOverSwitchChange(dataItem: any, checked: boolean) {
    const cutToUpdate = this.cuts.find(c => c.order === dataItem.order);
    if (cutToUpdate) {
      cutToUpdate.active = checked;
    }
    }

  // Reproducción de voice-over
  togglePlayVoiceover(dataItem: any, isResetAction: boolean = false) {
    const audioEl = this.audioEl;
    const fileId = dataItem.id;

    const notifyGlobal = (id: number, value: boolean, isReset: boolean) => {
        this.mediaDetailService.notifyAudioState(id, value, isReset);
    };

    const syncIsPlaying = (id: number, value: boolean) => {
      if (this.voiceoverFiles && Array.isArray(this.voiceoverFiles)) {
        const item = this.voiceoverFiles.find(f => f.id === id);
        if (item) {
          item.isPlaying = value;
        }
      }
    };

    const pauseAll = () => {
      if (this.voiceoverFiles && Array.isArray(this.voiceoverFiles)) {
        this.voiceoverFiles.forEach(f => f.isPlaying = false);
      }
      notifyGlobal(this.currentAudioFileId, false, false);
    };

    if (dataItem.isPlaying) {
      audioEl.pause();
      syncIsPlaying(fileId, false);
      notifyGlobal(fileId, false, false);
      return;
    }

    const globalState = this.mediaDetailService.getCurrentAudioState();
    if (globalState.id === fileId && audioEl.src) {
      this.currentAudioFileId = fileId;
      audioEl.play().then(() => {
        syncIsPlaying(fileId, true);
        notifyGlobal(fileId, true, false);
      }).catch((error) => {
        console.error('Error al reproducir el audio:', error);
        syncIsPlaying(fileId, false);
        notifyGlobal(fileId, false, false);
      });
      return;
    }

    pauseAll();

    try {
      audioEl.pause();
    } catch (e) {
      console.error('Error al pausar el audio:', e);
    }

    this.loadingAudioIds.add(fileId);

    this.mediaDetailService.getAudioFile(fileId).subscribe({
      next: (blob) => {
        const newBlobUrl = URL.createObjectURL(blob);

        // Revocar el blobUrl anterior solo si no está en caché
        if (this.blobUrl) {
          URL.revokeObjectURL(this.blobUrl);
        }
        this.blobUrl = newBlobUrl;

        audioEl.src = newBlobUrl;
        audioEl.load();
        this.currentAudioFileId = fileId;

        this.loadingAudioIds.delete(fileId);

        audioEl.play().then(() => {
          syncIsPlaying(fileId, true);
          notifyGlobal(fileId, true, isResetAction);
        }).catch((error) => {
          alert('Error al reproducir el audio: ' + error);
          syncIsPlaying(fileId, false);
          notifyGlobal(fileId, false, false);
        });
      },
      error: (err) => {
        this.loadingAudioIds.delete(fileId);
        alert('Error al reproducir el audio: ' + err.message);
        syncIsPlaying(fileId, false);
        notifyGlobal(fileId, false, false);
      }
    });
  }

  resetAudio(dataItem: any) {

    if (dataItem.id !== this.currentAudioFileId) {
      
      const dataList = this.voiceoverFiles; 
      if (dataList) { dataList.forEach(f => f.isPlaying = false); }
      this.togglePlayVoiceover(dataItem, true); 
      return;
    }

    this.audioEl.currentTime = 0;
    
    // Si estaba pausado o si estaba sonando, lo forzamos a sonar desde el principio
    this.audioEl.play().then(() => {
        const dataList = this.voiceoverFiles;
        if (dataList) {
             const item = dataList.find(f => f.id === dataItem.id);
             if (item) item.isPlaying = true;
        }

        // Notificar al mundo que esto fue un RESET
        this.mediaDetailService.notifyAudioState(dataItem.id, true, true);
    }).catch((error) => {
        alert('Error al reproducir el audio: ' + error);
    });
  }

  // Detener reproducción de todos los voice-overs
  private stopAllVoiceoverPlayback() {
    this.voiceoverFiles.forEach(file => {
      file.isPlaying = false;
      this.mediaDetailService.notifyAudioState(file.id, false, false);
    });

    if (this.audioEl) {
      this.audioEl.pause();
      this.audioEl.currentTime = 0;
    }

    this.currentAudioFileId = null;
  }

  updateGridAudioStatus(id: number, isPlaying: boolean, isReset: boolean, isVoiceover: boolean = false) {
    const dataList = this.voiceoverFiles;
    if (!dataList) return;

    console.log("updateGridAudioStatus", id, isPlaying, isReset, isVoiceover);

    if (isVoiceover){
      this.audioEl.pause();
      this.stopAllVoiceoverPlayback();
    }
    // Resetear visualmente todos los demás a pausa si se está reproduciendo uno nuevo
    if (isPlaying) {
        dataList.forEach(item => item.isPlaying = false);
    }

    // Encontrar el registro específico
    const item = dataList.find(f => f.id === id);
    
    if (item) {
        // Lógica de control del Audio Element nativo LOCAL

        if (this.currentAudioFileId === id) {
            
            if (isPlaying) {
                // Es un REINICIO
                if (isReset) {
                    this.audioEl.currentTime = 0;
                    if (this.audioEl.paused) {
                        this.audioEl.play().catch(e => console.error("Error auto-play on reset:", e));
                    }
                } 
                // Es un PLAY normal (reanudar)
                else {
                    if (this.audioEl.paused) {
                        this.audioEl.play().catch(e => console.error("Error auto-play on sync:", e));
                    }
                }
            } else {
                // Es una PAUSA
                if (!this.audioEl.paused) {
                    this.audioEl.pause();
                }
            }
        } else {
            if (isPlaying && !this.audioEl.paused) {
                 this.audioEl.pause();
            }
        }

        // Actualizar estado visual (Icono)
        item.isPlaying = isPlaying;
    }
}
}