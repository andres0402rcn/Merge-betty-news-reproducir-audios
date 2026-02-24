import { AuthService } from '../_services/auth.service';
import { Router, ActivatedRoute } from '@angular/router';
import { Component, OnInit, ViewChild, ElementRef, OnDestroy } from '@angular/core';
import { StorageService } from '../_services/storage.service';
import { DataStateChangeEvent, RowClassArgs } from '@progress/kendo-angular-grid';
import { process, State } from '@progress/kendo-data-query';
import { MediaDetailService } from '../_services/media-detail.service';
import { AIFileService } from '../_services/ai-file.service';
import { ComboBoxComponent, DropDownFilterSettings } from "@progress/kendo-angular-dropdowns";
import { delay, from, map, Subscription, switchMap, tap } from 'rxjs';
import { saveAs } from 'file-saver';
import { ConfirmActionType } from '../_helpers/enum-confirmation-action';
import { DatePickerComponent } from '@progress/kendo-angular-dateinputs';
import { YoutubeAccessUserSamService } from '../_services/youtube-access-user-sam.service';

@Component({
  selector: 'app-media-details-sam',
  templateUrl: './media-details-sam.component.html',
  styleUrls: ['./media-details-sam.component.css']
})
export class MediaDetailsComponent implements OnInit, OnDestroy {

  // Configuración del grid
  public tokenSam: any;
  public pageSize = 100;
  public skip = 0;
  public mediaDetails: any;
  public gridData: any;
  public loading = false;
  public isLoading = false;
  public msgNoRecords = "Descargando datos...";
  public msgLoading = "No se han encontrado registros con los criterios de búsqueda o filtros usados";

  public state: State = {
    skip: 0,
    take: 100,
    filter: {
      logic: 'and',
      filters: []
    }
  };

  public usersList: any[] = [];
  private allUsers: any[] = [];
  public selectedUserCombo: any = null;
  public sourcesList: any[] = [];
  private allSources: any[] = [];

  public dateFrom: string | null = null;
  public dateTo: string | null = null;
  public maxDateFrom: Date | null = null;
  public minDateTo: Date | null = null;
  public dateFromValue: Date | null = null;
  public dateToValue: Date | null = null;
  public focusedDateFrom: Date | null = null;

  public gridPaneSize = '55%';
  public selectedRowId: any;
  public selectedMediaItem: any = null;

  public isLoggedIn = false;
  public user: any;
  public userRoles: any[];
  public showAdminMenu = false;
  public showYoutubeSection = false;

  public voiceover: boolean = false;

  public confirmAction: ConfirmActionType = ConfirmActionType.None;
  public confirmPayload: any = null;
  public confirmOpened = false;
  public confirmMessage = '';
  public confirmItemId: any;
  public dialogWidth = 400;

  @ViewChild("comboUser") comboUser: ComboBoxComponent;
  @ViewChild("comboSource") comboSource: ComboBoxComponent;
  @ViewChild('dateFromPicker', { static: false }) dateFromPicker!: DatePickerComponent;
  @ViewChild('dateToPicker', { static: false }) dateToPicker!: DatePickerComponent;
  @ViewChild('audioPlayer', { static: false }) audioPlayer: ElementRef;


  public interval: any;
  public mediaDetailsSubscription: Subscription;
  public mediaDetailAudioSubscription: Subscription;
  // Componentes de corte de video
  public cutsGridData: any[] = [];
  public cutStart: number | null = null;
  public cutEnd: number | null = null;
  public cuts: { order: number; start: number; end: number; mediaDetailId: number; mediaDetailVoiceId: number; fps: number | null; transition: boolean; active: boolean }[] = [];
  public activeCut: { start: number; end: number } | null = null;
  public currentCutIndex: number = -1;
  public sequencePlaying: boolean = false;
  public activeCutIndex: number = -1;
  public activeCutIcon: string = 'video-external';
  public lastCutCompleted: boolean = false;

  // YouTube publishing properties
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

  // Video format properties
  public verticalFormat: any = null;
  public videoBackground: any = null;
  public verticalFormatOptions: any[] = [];
  public videoBackgroundOptions: any[] = [];
  private videoBackgroundData: any[] = [];

  // Type Cut and Graphic Image properties
  public selectedTypeCut: any = null;
  public selectedGraphicImage: any = null;
  public typeCutOptions: any[] = [];
  public graphicImageOptions: any[] = [];
  public filteredGraphicImageOptions: any[] = [];
  private typeCutData: any[] = [];
  private graphicImageData: any[] = [];

  // Voice-over properties
  public voiceoverFiles: any[] = [];
  private currentAudioFileId: number | null = null;
  private blobUrl: string = '';

  // Progress dialog properties
  public progressDialogOpened: boolean = false;
  public progressPercentage: number = 0;
  public progressMessage: string = '';
  public isProcessingComplete: boolean = false;
  public processingError: boolean = false;
  public clipUrl: string = '';
  public youtubeUrl: string = '';
  private progressInterval: any;
  private currentJobCutId: number | null = null;

  constructor(
    private authService: AuthService,
    private route: ActivatedRoute,
    private mediaDetailService: MediaDetailService,
    private router: Router,
    private storageService: StorageService,
    private aiFileService: AIFileService,
    private youtubeAccessUserSamService: YoutubeAccessUserSamService
  ) { }

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      this.tokenSam = params['token'];
      if (this.tokenSam) {
        this.authService.getUsernameFromToken(this.tokenSam).subscribe({
          next: (username) => {
            this.user = { username };
            this.checkYoutubePermissions();

            this.state = {
              skip: 0,
              take: 100,
              sort: [
                {
                  field: 'datetimeCreation',
                  dir: 'desc'
                }
              ],
              filter: {
                logic: 'and',
                filters: [
                  {
                    field: 'creationUsername',
                    operator: 'eq',
                    value: username
                  }
                ]
              }
            };

            if (this.voiceover){
              this.filterAudioFiles();
            }
            else{
              this.loadData(this.tokenSam);
            }

            this.interval = setInterval(() => this.voiceover ? this.filterAudioFiles() : this.loadData(this.tokenSam), 180000);
          },
          error: () => {
            console.error('Token inválido o error al obtener usuario');
            alert('No se pudo identificar el usuario');
          }
        });
      } else {
        alert('Este contenido requiere una autorización válida. El acceso no es posible en este momento.');
      }
    });

    this.router.events.subscribe(() => {
      const footer = document.getElementById('main-footer');
      if (footer) {
        footer.style.display = this.router.url.includes('assets-sam') ? 'none' : '';
      }
    });
  }

  ngAfterViewInit() {
    this.setupGridFilters();
  }

  ngOnDestroy(): void {
    if (this.interval) clearInterval(this.interval);
    if (this.mediaDetailsSubscription) this.mediaDetailsSubscription.unsubscribe();
    if (this.mediaDetailAudioSubscription) this.mediaDetailAudioSubscription.unsubscribe();
    if (this.blobUrl) {
      URL.revokeObjectURL(this.blobUrl);
    }
  }

  private setupGridFilters(): void {
    const contains = (value) => (s) =>
      s.text.toLowerCase().indexOf(value.toLowerCase()) !== -1;

    const normalizeText = (text: string): string => {
      return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    };

    const containsIgnoreAccents = (searchValue: string) => (item: any) => {
      const normalizedSearch = normalizeText(searchValue);
      const normalizedText = normalizeText(item.text);
      return normalizedText.includes(normalizedSearch);
    };

    this.comboUser.filterChange
      .asObservable()
      .pipe(
        switchMap((value) =>
          from([this.allUsers.map(username => ({ text: username, value: username }))]).pipe(
            tap(() => (this.comboUser.loading = true)),
            delay(200),
            map((usersList) => {
              if (!value) {
                return usersList.sort((a, b) => a.text.localeCompare(b.text));
              }
              return usersList.filter(containsIgnoreAccents(value));
            })
          )
        )
      )
      .subscribe((x) => {
        this.comboUser.loading = false;
        this.usersList = x;
      });

    this.comboSource.filterChange
      .asObservable()
      .pipe(
        switchMap((value) =>
          from([this.allSources.map(username => ({ text: username, value: username }))]).pipe(
            tap(() => (this.comboSource.loading = true)),
            delay(200),
            map((sourcesList) => {
              if (!value) {
                return sourcesList.sort((a, b) => a.text.localeCompare(b.text));
              }
              return sourcesList.filter(containsIgnoreAccents(value));
            })
          )
        )
      )
      .subscribe((x) => {
        this.comboSource.loading = false;
        this.sourcesList = x;
      });

  }

  // Cargar datos  del grid
  loadData(token?: string): void {
    this.loading = true;
    this.isLoading = true;
    document.body.style.cursor = 'wait';
    this.mediaDetailsSubscription = this.mediaDetailService.getListMediaDetailSam(token).subscribe({
      next: (data) => {
        this.mediaDetails = JSON.parse(data);
        this.gridData = process(this.mediaDetails, this.state);
        this.loading = false;
        this.isLoading = false;
        document.body.style.cursor = 'default';

        this.allUsers = Array.from(new Set(this.mediaDetails.map((item: any) => item.creationUsername + ' - ' + item.creationRealName)))
          .filter(username => !!username);

        const defaultUser = this.allUsers.find(u => u.startsWith(this.user.username + ' -'));
        let currentUserItem = this.selectedUserCombo;

        if (currentUserItem === null) {
          if (defaultUser) {
            currentUserItem = {
              text: defaultUser,
              value: defaultUser
            }
          } else {
            this.allUsers.push(this.user.username);
            currentUserItem = {
              text: this.user.username,
              value: this.user.username
            }
          }
          this.selectedUserCombo = currentUserItem;
          this.onUserFilterChange(this.selectedUserCombo, null);
        }

        this.usersList = this.allUsers.map(user => ({
          text: user,
          value: user
        }));

        this.usersList = this.usersList.sort((a, b) => a.text.localeCompare(b.text));

        this.allSources = Array.from(new Set(this.mediaDetails.map((item: any) => item.typeSourceName)))
          .filter(username => !!username);

        this.sourcesList = this.allSources.map(source => ({
          text: source,
          value: source
        }));

        this.sourcesList = this.sourcesList.sort((a, b) => a.text.localeCompare(b.text));
      },
      error: (err) => {
        this.mediaDetails = [];
        this.gridData = { data: [], total: 0 };
        this.loading = false;
        this.isLoading = false;
        document.body.style.cursor = 'default';
        console.error('Error loading media details:', err);
      },
    });
  }

  
  // Cambiar filtro por usuario
  onUserFilterChange(value: any | null, filter: any): void {
    const currentFilters = this.state.filter?.filters || [];

    const otherFilters = currentFilters.filter(f => {
      return !(f && 'field' in f && f.field === 'creationUsername');
    });

    if (value !== null && value !== undefined) {
      const selectedUser = typeof value === 'string' ? value : value.text;
      const selectedUserUsername = selectedUser ? selectedUser.split(" - ")[0] : null;

      if (selectedUserUsername) {
        const userFilter = {
          field: 'creationUsername',
          operator: 'eq',
          value: selectedUserUsername
        };

        otherFilters.push(userFilter);

        if (filter && filter.filters) {
          filter.filters = [userFilter];
        }
      }
    }

    this.state = {
      ...this.state,
      skip: 0,
      filter: {
        logic: 'and',
        filters: otherFilters
      }
    };

    this.gridData = process(this.mediaDetails, this.state);
  }

  // Cambiar filtro por fuente
  onSourceFilterChange(value: any | null, filter: any): void {
    const currentFilters = this.state.filter?.filters || [];

    const otherFilters = currentFilters.filter(f => {
      return !(f && 'field' in f && f.field === 'typeSourceName');
    });

    if (value !== null && value !== undefined) {
      const selectedSource = typeof value === 'string' ? value : value.text;

      if (selectedSource) {
        const sourceFilter = {
          field: 'typeSourceName',
          operator: 'eq',
          value: selectedSource
        };

        otherFilters.push(sourceFilter);

        if (filter && filter.filters) {
          filter.filters = [sourceFilter];
        }
      }
    }

    this.state = {
      ...this.state,
      skip: 0,
      filter: {
        logic: 'and',
        filters: otherFilters
      }
    };

    this.gridData = process(this.mediaDetails, this.state);
  }

  // Cambio en rango de fechas
  onDateRangeChange(): void {
    const currentFilters = this.state.filter?.filters || [];

    const otherFilters = currentFilters.filter(f => {
      return !(f && 'field' in f && f.field === 'datetimeCreation');
    });

    if (this.dateFrom && this.dateTo) {
      const dateFilter = {
        logic: 'and' as 'and',
        filters: [
          {
            field: 'datetimeCreation',
            operator: 'gte',
            value: this.dateFrom
          },
          {
            field: 'datetimeCreation',
            operator: 'lte',
            value: this.dateTo
          }
        ]
      };

      otherFilters.push(dateFilter);
    } else if (this.dateFrom) {
      const dateFilter = {
        field: 'datetimeCreation',
        operator: 'gte',
        value: this.dateFrom
      };

      otherFilters.push(dateFilter);
    } else if (this.dateTo) {
      const dateFilter = {
        field: 'datetimeCreation',
        operator: 'lte',
        value: this.dateTo
      };

      otherFilters.push(dateFilter);
    }

    this.state = {
      ...this.state,
      skip: 0,
      filter: {
        logic: 'and',
        filters: otherFilters
      }
    };

    // Procesar los datos
    this.gridData = process(this.mediaDetails, this.state);
  }

  // Filtrar desde fecha
  filterFromDate(value: Date | null): void {
    this.dateFromValue = value;

    if (value !== null && value !== undefined) {
      this.dateFrom = this.formatToCustomDateTime(value);
      this.minDateTo = value;
    } else {
      this.dateFrom = null;
      this.minDateTo = null;
    }

    this.onDateRangeChange();
  }

  // Filtrar hasta fecha
  filterToDate(value: Date | null): void {
    this.dateToValue = value;
    if (value !== null && value !== undefined) {
      const endOfDay = new Date(value);
      endOfDay.setHours(23, 59, 59, 999);
      this.dateTo = this.formatToCustomDateTime(endOfDay);
      this.maxDateFrom = value;
      this.focusedDateFrom = value;
    } else {
      this.dateTo = null;
      this.maxDateFrom = null;
      this.focusedDateFrom = null;
    }

    this.onDateRangeChange();
  }

  // Formatear fecha a formato personalizado
  formatToCustomDateTime(date: Date | null): string {
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
  }

  // Limpiar fecha desde
  clearFromDate(event?: Event): void {
    if (event) {
      event.stopPropagation();
    }

    this.dateFrom = null;
    this.dateFromPicker.writeValue(null)
    this.minDateTo = null;
    this.onDateRangeChange();
  }

  // Limpiar fecha hasta
  clearToDate(event?: Event): void {
    if (event) {
      event.stopPropagation();
    }

    this.dateTo = null;
    this.dateToPicker.writeValue(null)
    this.maxDateFrom = null;
    this.focusedDateFrom = null;
    this.onDateRangeChange();
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

  // Recargar datos del grid
  btnReload_onclick(): void {
    if (this.voiceover) {
      this.filterAudioFiles();
    } else {
      this.loadData(this.tokenSam);
    }
  }

  // Cambio de estado del grid
  grid_dataStateChange(state: DataStateChangeEvent): void {
    this.state = state;
    this.skip = state.skip ?? 0;
    this.gridData = process(this.mediaDetails, this.state);
  }

  rowCallback = (context: RowClassArgs) => {
    return {
      'k-selected': context.dataItem.id === this.selectedRowId
    };
  };

  // Reproducir video seleccionado
  btnPlayVideo_onclick(dataItem: any): void {
    this.selectedRowId = dataItem.id;
    this.selectedMediaItem = dataItem;
    this.gridData = process(this.mediaDetails, this.state);
  }

  // Manejar carga de video
  onVideoLoaded(dataItem: any): void {
    console.log('Video loaded:', dataItem);
  }

  onCutsGenerated(cutsData: any): void {
    console.log('Cuts generated:', cutsData);
  }

  onMediaItemChanged(dataItem: any): void {
    this.selectedRowId = dataItem.id;
    this.selectedMediaItem = dataItem;
    this.gridData = process(this.mediaDetails, this.state);
  }

  // Cancelar confirmación
  btn_confirmCancel(): void {
    this.confirmOpened = false;
    this.confirmAction = ConfirmActionType.None;
    this.confirmPayload = null;
  }

  // Confirmar acción
  btn_confirmOk(): void {
    this.confirmOpened = false;

    switch (this.confirmAction) {
      case ConfirmActionType.ProcessAI:
        if (!this.voiceover){
          this.sendToAI(this.confirmPayload?.id);
        }
        else{
          this.sendAudioToAI(this.confirmPayload?.id);
        }
        break;

      case ConfirmActionType.SetPrivacy:
        this.processPrivacyChange(this.confirmPayload.id, this.confirmPayload.action);
        break;

      case ConfirmActionType.GenerateProxy:
        this.generateProxy(this.confirmPayload.id);
        break;

      default:
        break;
    }

    this.confirmAction = ConfirmActionType.None;
    this.confirmPayload = null;
  }

  // Confirmar procesamiento con IA
  ProcessAI(dataItem: any): void {
    this.confirmMessage = `¿Desea generar transcripción y resumen con IA para el video "${dataItem.title}"?`;
    this.confirmAction = ConfirmActionType.ProcessAI;
    this.confirmPayload = dataItem;
    this.confirmOpened = true;
  }

  // Enviar video a procesamiento IA
  sendToAI(id: any): void {
    this.mediaDetailService.processAI(id).subscribe({
      next: (response) => {
        console.log('Respuesta del servidor:', response);
        this.loadData(this.tokenSam);
      },
      error: (error) => {
        console.error('Error al procesar con IA:', error);
        alert('Error al procesar con IA, por favor intente de nuevo');
      }
    });
  }

  // Descargar archivo generado por IA
  downloadFile(aiFileId: number, aiFilePath: string): void {
    this.aiFileService.downloadFileSam(aiFileId, this.tokenSam).subscribe({
      next: (blob) => {
        const fileName = aiFilePath ? aiFilePath.split('/').pop() : 'archivo.txt';
        saveAs(blob, fileName);
      },
      error: (error) => {
        if (error.error instanceof Blob) {
          const reader = new FileReader();
          reader.onload = () => {
            const errorMsg = reader.result?.toString() || 'Error al descargar el archivo.';
            alert(errorMsg);
          };
          reader.readAsText(error.error);
        } else {
          alert('No se pudo descargar el archivo. Verifique su conexión o intente más tarde.');
        }
        console.error('Error al descargar el archivo:', error);
      }
    });
  }

  
  sendAudioToAI(id: any): void {
    this.mediaDetailService.processAudioAI(id).subscribe({
      next: (response) => {
        console.log('Respuesta del servidor:', response);
        this.filterAudioFiles();
      },
      error: (error) => {
        console.error('Error al procesar con IA:', error);
        alert('Error al procesar con IA, por favor intente de nuevo');
      }
    });
  }

  // Verificar si el video valido para IA
  isEligibleForAI(dataItem: any): boolean {
    const validStatuses = [6, 8, 9, 11];
    return (
      !dataItem.transcriptionPath &&
      !dataItem.articleAnthropicPath &&
      dataItem.typeAssetId === 1 &&
      validStatuses.includes(dataItem.typeAssetStatusId)
    );
  }

   audioIsEligibleForAI(dataItem: any): boolean {
    return (
      !dataItem.transcriptionPath &&
      !dataItem.articleAnthropicPath
    );
  }

  // Sección de privacidad de video
  setVideoPrivacy(dataItem: any, action: 'private' | 'public'): void {
    const message =
      action === 'private'
        ? `El video "${dataItem.title}" actualmente es público. ¿Está seguro de restringir el acceso?`
        : `El video "${dataItem.title}" actualmente es privado. ¿Está seguro de volverlo público?`;

    this.confirmMessage = message;
    this.confirmAction = ConfirmActionType.SetPrivacy;
    this.confirmPayload = { id: dataItem.id, action };
    this.confirmOpened = true;
  }

  // Procesar cambio de privacidad
  private processPrivacyChange(id: any, action: 'private' | 'public'): void {
    this.mediaDetailService.updatePrivacy(id, action).subscribe({
      next: (response) => {
        console.log(`Privacidad actualizada para ${id}: ${action}`);
        this.loadData(this.tokenSam);
      },
      error: (error) => {
        console.error('Error al cambiar privacidad:', error);
        alert('Error al cambiar la privacidad, por favor intente de nuevo.');
      }
    });
  }

  // Confirmar generación de proxy
  confirmGenerateProxy(dataItem: any): void {
    this.confirmMessage = `¿Desea generar el video de la noticia "${dataItem.newsName}"?`;
    this.confirmAction = ConfirmActionType.GenerateProxy;
    this.confirmPayload = dataItem;
    this.confirmOpened = true;
  }

  // Generar proxy del video
  generateProxy(id: number): void {
    this.mediaDetailService.generateProxy(id).subscribe({
      next: (response) => {
        console.log('El video será generado. Puede tardar unos minutos.');
        this.loadData(this.tokenSam);
      },
      error: (error) => {
        console.error('Error al generar el video:', error);
        alert('No se pudo generar el video. Intente nuevamente más tarde.');
      }
    });
  }

  // Verificar si el estado permite reproducción
  isPlayableStatus(statusId: number): boolean {
    const playableStatuses = [6, 8, 9, 10, 11, 12, 13, 14];
    return playableStatuses.includes(statusId);
  }

   public filterVoiceoverFiles: DropDownFilterSettings = {
    caseSensitive: false,
    operator: "contains",
  };  

    // lógica del componente Drag & Drop Grid - ListView...
    // Item siendo arrastrado
    // Datos del ListView (productos seleccionados)
    public selectedProducts: any[] = [];  
    private draggedItem: any | null = null;
    public isDragOver: boolean = false;
    // Evento cuando comienza el drag desde el Grid
    onDragStart(event: DragEvent, dataItem: any) {
      this.draggedItem = dataItem;
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setData('text/plain', JSON.stringify(dataItem));
      }
      this.isDragOver = true;
    }
  
    // Evento cuando termina el drag
    onDragEnd(event: DragEvent) {
      this.draggedItem = null;
      this.isDragOver = false;
    }
  
    // Evento cuando se arrastra sobre el ListView
    onDragOver(event: DragEvent) {
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy';
      }
      this.isDragOver = true;
    }

  // Filtrar archivos de audio
  filterAudioFiles(): void {
    this.voiceover = true;
    this.loading = true;
    this.isLoading = true;
    document.body.style.cursor = 'wait';
      this.mediaDetailAudioSubscription = this.mediaDetailService.getListMediaDetailAudiosSam(this.tokenSam).subscribe({
        next: (data) => {
          this.mediaDetails = JSON.parse(data);
          this.gridData = process(this.mediaDetails, this.state);
          this.loading = false;
          this.isLoading = false;
          document.body.style.cursor = 'default';
          this.voiceover = true;

          this.allUsers = Array.from(new Set(this.mediaDetails.map((item: any) => item.creationUsername + ' - ' + item.creationRealName)))
          .filter(username => !!username);

          this.usersList = this.allUsers.map(user => ({
            text: user,
            value: user
          }));

          this.allSources = Array.from(new Set(this.mediaDetails.map((item: any) => item.typeSourceName)))
            .filter(username => !!username);

          this.sourcesList = this.allSources.map(source => ({
            text: source,
            value: source
          }));

          if (this.currentAudioFileId && !this.audioPlayer.nativeElement.paused) {
            // Buscar el ítem en la nueva lista cargada que coincida con el ID actual
            const currentItem = this.gridData.data.find((item: any) => item.id === this.currentAudioFileId);
            
            // Si existe en la nueva lista, marcarlo visualmente como reproduciendo
            if (currentItem) {
              currentItem.isPlaying = true;
            }
          }
        },
        error: (err) => {
          console.error('Error fetching audio media details:', err);
          this.loading = false;
          this.isLoading = false;
          document.body.style.cursor = 'default';
        }
      })
    
    }

    filterVideoFiles(): void {
      const audioEl = this.audioPlayer.nativeElement;
      if (this.voiceover){
         // Pausar solo si el archivo actual NO está en voiceoverFiles
        const isPlayingInVoiceover = this.voiceoverFiles.some(f => f.id === this.currentAudioFileId);
        
        if (!isPlayingInVoiceover) {
          try {
            audioEl.pause();
          } catch (err) {
            console.log(err);
          }
        }
        this.voiceover = false;
        this.loadData(this.tokenSam);
      }
    }
  
    // Eliminar item del ListView
    removeFromSelected(product: any) {
      const index = this.voiceoverFiles.findIndex(p => p.id === product.id);
      if (index > -1) {
        // Si se elimina el archivo que estaba reproduciéndose, pausar y limpiar
       if(this.currentAudioFileId === product.id) {
         this.audioPlayer.nativeElement.pause();
         this.audioPlayer.nativeElement.src = '';
         this.currentAudioFileId = null;
       }
        this.voiceoverFiles.splice(index, 1);
        this.voiceoverFiles = [...this.voiceoverFiles];
      }
    }  

    onVoiceOverSwitchChange(dataItem: any, checked: boolean) {
    const cutToUpdate = this.cuts.find(c => c.order === dataItem.order);
    if (cutToUpdate) {
      cutToUpdate.active = checked;
    }
    }

     togglePlayVoiceover(dataItem: any) {
    const audioEl = this.audioPlayer.nativeElement;
    const fileId = dataItem.id;

    // Helper para sincronizar isPlaying en ambas listas por id
    const syncIsPlaying = (id: number, value: boolean) => {
      if (this.gridData?.data && Array.isArray(this.gridData.data)) {
        const item = this.gridData.data.find(f => f.id === id);
        if (item) item.isPlaying = value;
      }
      if (this.voiceoverFiles && Array.isArray(this.voiceoverFiles)) {
        const item = this.voiceoverFiles.find(f => f.id === id);
        if (item) item.isPlaying = value;
      }
    };

    // Helper para pausar todos
    const pauseAll = () => {
      if (this.gridData?.data && Array.isArray(this.gridData.data)) {
        this.gridData.data.forEach(f => f.isPlaying = false);
      }
      if (this.voiceoverFiles && Array.isArray(this.voiceoverFiles)) {
        this.voiceoverFiles.forEach(f => f.isPlaying = false);
      }
    };

    // Si está reproduciendo este archivo → pausar
    if (dataItem.isPlaying) {
      audioEl.pause();
      syncIsPlaying(fileId, false);
      return;
    }
    
    // Si es el mismo archivo pausado → reanudar sin recargar
    if (this.currentAudioFileId === fileId && audioEl.src) {
      audioEl.play().then(() => {
        syncIsPlaying(fileId, true);
      }).catch((error) => {
        console.error('Error al reproducir el audio:', error);
        syncIsPlaying(fileId, false);
      });
      return;
    }

    // Nuevo archivo → pausar todo y cargar
    pauseAll();

    try {
      audioEl.pause();
    } catch (e) {
      console.error('Error al pausar el audio:', e);
    }

    this.mediaDetailService.getAudioFileSam(fileId, this.tokenSam).subscribe({

      next: (blob) => {
        //Revocar el último blob para liberar memoria
        if (this.blobUrl) {
          URL.revokeObjectURL(this.blobUrl);
        }

        this.blobUrl = URL.createObjectURL(blob);
        audioEl.src = this.blobUrl;
        this.currentAudioFileId = fileId;

        audioEl.play().then(() => {
          syncIsPlaying(fileId, true);
        }).catch((error) => {
          alert('Error al reproducir el audio: ' + error);
          syncIsPlaying(fileId, false);
        });
      },
      error: (err) => {
        alert('Error al reproducir el audio: ' + err.message);
        syncIsPlaying(fileId, false);
      }
    });
  }

  resetAudio(dataItem: any) {
    const audioEl = this.audioPlayer.nativeElement;

    if (dataItem.id !== this.currentAudioFileId) {
      if (this.gridData?.data && Array.isArray(this.gridData.data)) {
        this.gridData.data.forEach(f => f.isPlaying = false);
      }
      if (this.voiceoverFiles && Array.isArray(this.voiceoverFiles)) {
        this.voiceoverFiles.forEach(f => f.isPlaying = false);
      }
      this.togglePlayVoiceover(dataItem);
      return;
    }

    audioEl.currentTime = 0;
    if (!dataItem.isPlaying) {
      audioEl.play().then(() => {
        // Sincronizar ambas listas
        if (this.gridData?.data && Array.isArray(this.gridData.data)) {
          const item = this.gridData.data.find(f => f.id === dataItem.id);
          if (item) item.isPlaying = true;
        }
        if (this.voiceoverFiles && Array.isArray(this.voiceoverFiles)) {
          const item = this.voiceoverFiles.find(f => f.id === dataItem.id);
          if (item) item.isPlaying = true;
        }
      }).catch((error) => {
        alert('Error al reproducir el audio: ' + error);
      });
    }
  }

     private checkYoutubePermissions(): void {
    if (this.user && this.user.username) {
      this.youtubeAccessUserSamService.hasYoutubeAccess(this.user.username).subscribe({
        next: (hasAccess) => {
          this.showYoutubeSection = hasAccess;
          console.log(`Usuario ${this.user.username} tiene acceso a YouTube: ${hasAccess}`);
        },
        error: (error) => {
          console.error('Error verificando permisos de YouTube:', error);
          this.showYoutubeSection = false;
        }
      });
    }
  }
}
