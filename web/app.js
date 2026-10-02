/**
 * app.js
 *
 * NWelch Toolbox:
 * 1. Time Series & Diagnostics (Stacked subpanels, cadence distribution, symmetric spectral window W(f), LS periodograms).
 * 2. 1D Welch PSD & Bivariate Coherence (Interactive time-domain segmentation, Welch PSD overlaid on LS, Fisher z(f) coherence).
 * 3. 2D Dual-Frequency Coherence Matrix (Interactive beat matrix, node metrics, linked 1D horizontal & antidiagonal slices).
 */

// Application State
const state = {
  datasets: {},
  currentDataset: 'harpsn',
  mode: 'auto',
  series1: 'RV',
  series2: 'FWHM',
  preset: '10yr',
  L_pts: 200,
  taper: 'KaiserBessel',
  fap_type: 'analytical',
  n_mc: 200,
  fmin: 0.0,
  fmax: 0.10,
  colormap: 'inferno',
  contrast: 'high',
  maskDiagonal: false,
  maskDiagonalWidthFactor: 1.0,
  nHarmonics: 2,
  customPeriods: [],
  horizDomain: 'freq', // 'freq' or 'period'
  beatDomain: 'freq',  // 'freq' or 'period'
  horizYScale: 'linear', // 'linear' or 'log'
  beatYScale: 'linear',  // 'linear' or 'log'
  horizLayout: 'single', // 'single' (default) or 'subpanels'
  selectedHorizCutId: null,
  customGuidelines: [],
  
  // View Navigation & Contextual State
  activeView: 'dual2d', // 'timeseries', 'welch1d', 'dual2d'
  
  // View 1 (Time Series & Diagnostics) State
  selectedIndicators: ['RV', 'FWHM'],
  tsLayout: 'subpanels', // Always stacked subpanels for observations
  lsLayout: 'subpanels', // Default stacked subpanels for Periodograms
  tsFmin: 0.0,
  tsFmax: 0.15,
  fwinMax: 1.5,
  lsDomain: 'freq',     // 'freq' or 'period'
  lsScale: 'log',       // 'log' or 'linear'
  
  // View 2 (1D Welch & Bivariate Coherence) State
  welchSeries1: 'RV',
  welchSeries2: 'FWHM',
  welchK: 4,
  welchSegMode: 'adaptive', // 'adaptive' or 'uniform'
  welchTaper: 'None',
  welchPsdDomain: 'freq',   // 'freq' or 'period'
  welchPsdNorm: 'peak',     // 'peak' (Normalized P/P_max) or 'raw' (Parseval PSD)
  welchCohDomain: 'freq',   // 'freq' or 'period'
  welchCohScale: 'linear',  // 'linear' or 'log'
  welchCurves: {
    ls1: true,
    welch1: true,
    ls2: false,
    welch2: false
  },
  customSegments: null,
  dualSegSource: 'uniform', // 'uniform' or 'tab2'
  
  // Matrix Zoom State
  zoom: {
    isZoomed: false,
    f1_min: null,
    f1_max: null,
    f2_min: null,
    f2_max: null
  },
  
  // Horizontal Cuts & Coupled Slices State
  horizontalCuts: [],
  detectedPeaks: [],
  showFalContours: true,
  showCompFalContours: true,

  // Active Analysis Cache
  coherenceData: null,
  activeF1: null,
  activeF2: null,
  slicesData: null,
  diagnosticsData: null,
  welch1DData: null,
  comparisonData: null,
  compTaper: 'None',
  compRightView: 'delta',
  comp1DDataA: null,
  comp1DDataB: null
};

// DOM Elements
const el = {
  datasetSelect: document.getElementById('datasetSelect'),
  presetSelect: document.getElementById('presetSelect'),
  themeToggleBtn: document.getElementById('btnThemeToggle'),
  themeIconSun: document.getElementById('themeIconSun'),
  themeIconMoon: document.getElementById('themeIconMoon'),
  themeLabel: document.getElementById('themeLabel'),
  
  // Sidebar Panes
  sidebarTimeseries: document.getElementById('sidebarTimeseries'),
  sidebarWelch1D: document.getElementById('sidebarWelch1D'),
  sidebarDual2D: document.getElementById('sidebarDual2D'),
  
  // View Tabs & Views
  viewTabs: document.getElementById('viewTabs'),
  tabBtnLanding: document.getElementById('tabBtnLanding'),
  viewLanding: document.getElementById('viewLanding'),
  viewTimeseries: document.getElementById('viewTimeseries'),
  viewWelch1D: document.getElementById('viewWelch1D'),
  viewDual2D: document.getElementById('viewDual2D'),
  viewComparison: document.getElementById('viewComparison'),
  sidebarComparison: document.getElementById('sidebarComparison'),
  tabBtnComparison: document.getElementById('tabBtnComparison'),
  compPresetSelector: document.getElementById('compPresetSelector'),
  compDatasetASelect: document.getElementById('compDatasetASelect'),
  compPresetASelect: document.getElementById('compPresetASelect'),
  compSeries1ASelect: document.getElementById('compSeries1ASelect'),
  compSeries2ASelect: document.getElementById('compSeries2ASelect'),
  compKAInput: document.getElementById('compKAInput'),
  compKASlider: document.getElementById('compKASlider'),
  compSegStrategyA: document.getElementById('compSegStrategyA'),
  btnAutocalcCompA: document.getElementById('btnAutocalcCompA'),
  quickKAInput: document.getElementById('quickKAInput'),
  btnQuickAutocalcA: document.getElementById('btnQuickAutocalcA'),
  compDatasetBSelect: document.getElementById('compDatasetBSelect'),
  compPresetBSelect: document.getElementById('compPresetBSelect'),
  compSeries1BSelect: document.getElementById('compSeries1BSelect'),
  compSeries2BSelect: document.getElementById('compSeries2BSelect'),
  compKBInput: document.getElementById('compKBInput'),
  compKBSlider: document.getElementById('compKBSlider'),
  compSegStrategyB: document.getElementById('compSegStrategyB'),
  btnAutocalcCompB: document.getElementById('btnAutocalcCompB'),
  quickKBInput: document.getElementById('quickKBInput'),
  btnQuickAutocalcB: document.getElementById('btnQuickAutocalcB'),
  compFminInput: document.getElementById('compFminInput'),
  compFmaxInput: document.getElementById('compFmaxInput'),
  compTaperControl: document.getElementById('compTaperControl'),
  compTargetF2Input: document.getElementById('compTargetF2Input'),
  btnRunComparison: document.getElementById('btnRunComparison'),
  btnExportCompPNG: document.getElementById('btnExportCompPNG'),
  btnExportCompCSV: document.getElementById('btnExportCompCSV'),
  compStatNA: document.getElementById('compStatNA'),
  compStatNeffA: document.getElementById('compStatNeffA'),
  compStat2RA: document.getElementById('compStat2RA'),
  compStatProtA: document.getElementById('compStatProtA'),
  compMetricLabelA: document.getElementById('compMetricLabelA'),
  compStatNB: document.getElementById('compStatNB'),
  compStatNeffB: document.getElementById('compStatNeffB'),
  compStat2RB: document.getElementById('compStat2RB'),
  compStatProtB: document.getElementById('compStatProtB'),
  compMetricLabelB: document.getElementById('compMetricLabelB'),
  compBeatPeriodVal: document.getElementById('compBeatPeriodVal'),
  compBeatFreqVal: document.getElementById('compBeatFreqVal'),
  plotCompMapA: document.getElementById('plotCompMapA'),
  plotCompMapB: document.getElementById('plotCompMapB'),
  plotCompMapDelta: document.getElementById('plotCompMapDelta'),
  btnResetZoomCompDelta: document.getElementById('btnResetZoomCompDelta'),
  plotCompHorizSlice: document.getElementById('plotCompHorizSlice'),
  btnResetZoomCompA: document.getElementById('btnResetZoomCompA'),
  btnResetZoomCompB: document.getElementById('btnResetZoomCompB'),
  btnResetZoomCompHoriz: document.getElementById('btnResetZoomCompHoriz'),
  btnCompCutRot: document.getElementById('btnCompCutRot'),
  btnCompCut2Rot: document.getElementById('btnCompCut2Rot'),
  btnCompPresetRot: document.getElementById('btnCompPresetRot'),
  btnCompPreset2Rot: document.getElementById('btnCompPreset2Rot'),
  titleCompHoriz: document.getElementById('titleCompHoriz'),
  plotCompAntiDiagSlice: document.getElementById('plotCompAntiDiagSlice'),
  titleCompAntiDiag: document.getElementById('titleCompAntiDiag'),
  btnResetZoomCompAntiDiag: document.getElementById('btnResetZoomCompAntiDiag'),
  plotComp1DCohA: document.getElementById('plotComp1DCohA'),
  plotComp1DCohB: document.getElementById('plotComp1DCohB'),
  titleComp1DCohA: document.getElementById('titleComp1DCohA'),
  titleComp1DCohB: document.getElementById('titleComp1DCohB'),
  btnResetZoomComp1DCohA: document.getElementById('btnResetZoomComp1DCohA'),
  btnResetZoomComp1DCohB: document.getElementById('btnResetZoomComp1DCohB'),
  comp1DDatasetA: document.getElementById('comp1DDatasetA'),
  comp1DPresetA: document.getElementById('comp1DPresetA'),
  comp1DSeries1A: document.getElementById('comp1DSeries1A'),
  comp1DSeries2A: document.getElementById('comp1DSeries2A'),
  comp1DKInputA: document.getElementById('comp1DKInputA'),
  btnComp1DAutoA: document.getElementById('btnComp1DAutoA'),
  btnComp1DComputeA: document.getElementById('btnComp1DComputeA'),
  btnSyncComp1DA: document.getElementById('btnSyncComp1DA'),
  comp1DDatasetB: document.getElementById('comp1DDatasetB'),
  comp1DPresetB: document.getElementById('comp1DPresetB'),
  comp1DSeries1B: document.getElementById('comp1DSeries1B'),
  comp1DSeries2B: document.getElementById('comp1DSeries2B'),
  comp1DKInputB: document.getElementById('comp1DKInputB'),
  btnComp1DAutoB: document.getElementById('btnComp1DAutoB'),
  btnComp1DComputeB: document.getElementById('btnComp1DComputeB'),
  btnSyncComp1DB: document.getElementById('btnSyncComp1DB'),
  compNodeFreqs: document.getElementById('compNodeFreqs'),
  compNodePeriods: document.getElementById('compNodePeriods'),
  compNodeDeltaF: document.getElementById('compNodeDeltaF'),
  compNodePbeat: document.getElementById('compNodePbeat'),
  compNodeZA: document.getElementById('compNodeZA'),
  compBadgeZA: document.getElementById('compBadgeZA'),
  compNode2RA: document.getElementById('compNode2RA'),
  compNodeZB: document.getElementById('compNodeZB'),
  compBadgeZB: document.getElementById('compBadgeZB'),
  compNode2RB: document.getElementById('compNode2RB'),
  compNodeDeltaZ: document.getElementById('compNodeDeltaZ'),
  compNodeDeltaZDesc: document.getElementById('compNodeDeltaZDesc'),
  compFapA01: document.getElementById('compFapA01'),
  compFapA1: document.getElementById('compFapA1'),
  compFapA5: document.getElementById('compFapA5'),
  compFapB01: document.getElementById('compFapB01'),
  compFapB1: document.getElementById('compFapB1'),
  compFapB5: document.getElementById('compFapB5'),
  compBadgeA: document.getElementById('compBadgeA'),
  compANpts: document.getElementById('compANpts'),
  compAK: document.getElementById('compAK'),
  compANeff: document.getElementById('compANeff'),
  compA2R: document.getElementById('compA2R'),
  compBadgeB: document.getElementById('compBadgeB'),
  compBNpts: document.getElementById('compBNpts'),
  compBK: document.getElementById('compBK'),
  compBNeff: document.getElementById('compBNeff'),
  compB2R: document.getElementById('compB2R'),
  btnToggleCompTimeline: document.getElementById('btnToggleCompTimeline'),
  compTimelineBody: document.getElementById('compTimelineBody'),
  plotCompTimelineA: document.getElementById('plotCompTimelineA'),
  plotCompTimelineB: document.getElementById('plotCompTimelineB'),
  lblCompTimelineA: document.getElementById('lblCompTimelineA'),
  lblCompTimelineB: document.getElementById('lblCompTimelineB'),
  compPresetSelector: document.getElementById('compPresetSelector'),
  compFapControl: document.getElementById('compFapControl'),
  compMcContainer: document.getElementById('compMcContainer'),
  compMcInput: document.getElementById('compMcInput'),
  btnToggleCompFalA: document.getElementById('btnToggleCompFalA'),
  btnToggleCompFalB: document.getElementById('btnToggleCompFalB'),
  compFapTitleA: document.getElementById('compFapTitleA'),
  compFapTitleB: document.getElementById('compFapTitleB'),
  paletteContainer: document.getElementById('paletteContainer'),
  colormapSelect: document.getElementById('colormapSelect'),
  contrastContainer: document.getElementById('contrastContainer'),
  contrastSelect: document.getElementById('contrastSelect'),
  chkMaskDiagonal: document.getElementById('chkMaskDiagonal'),
  maskWidthContainer: document.getElementById('maskWidthContainer'),
  maskWidthSlider: document.getElementById('maskWidthSlider'),
  maskWidthVal: document.getElementById('maskWidthVal'),
  btnExportPNG: document.getElementById('btnExportPNG'),
  
  // Landing Page Elements
  landingDatasetName: document.getElementById('landingDatasetName'),
  landingN: document.getElementById('landingN'),
  landingTspan: document.getElementById('landingTspan'),
  landingCadence: document.getElementById('landingCadence'),
  landingProt: document.getElementById('landingProt'),
  btnLaunchComparison: document.getElementById('btnLaunchComparison'),

  // Top Header Status Chips
  statN: document.getElementById('statN'),
  statK: document.getElementById('statK'),
  statNeff: document.getElementById('statNeff'),
  stat2R: document.getElementById('stat2R'),
  statProt: document.getElementById('statProt'),
  
  // View 1 (Time Series & Diagnostics) Elements
  tsIndicatorGroup: document.getElementById('tsIndicatorGroup'),
  tsFminInput: document.getElementById('tsFminInput'),
  tsFmaxInput: document.getElementById('tsFmaxInput'),
  fwinMaxInput: document.getElementById('fwinMaxInput'),
  btnResetZoomTS: document.getElementById('btnResetZoomTS'),
  plotTimeSeries: document.getElementById('plotTimeSeries'),
  plotCadenceHist: document.getElementById('plotCadenceHist'),
  cadenceStatsContent: document.getElementById('cadenceStatsContent'),
  plotSpectralWindow: document.getElementById('plotSpectralWindow'),
  plotLSSpectra: document.getElementById('plotLSSpectra'),
  btnExportDiagPNG: document.getElementById('btnExportDiagPNG'),
  
  // View 2 (1D Welch & Bivariate Coherence) Elements
  welchSeries1Select: document.getElementById('welchSeries1Select'),
  welchSeries2Select: document.getElementById('welchSeries2Select'),
  welchKInput: document.getElementById('welchKInput'),
  welchKSlider: document.getElementById('welchKSlider'),
  btnAutocalcSegments: document.getElementById('btnAutocalcSegments'),
  btnRecalcWelch1D: document.getElementById('btnRecalcWelch1D'),
  btnApplyCustomSegments: document.getElementById('btnApplyCustomSegments'),
  btnExportWelch1DPNG: document.getElementById('btnExportWelch1DPNG'),
  plotSegmentTimeline: document.getElementById('plotSegmentTimeline'),
  segmentBoundsTable: document.getElementById('segmentBoundsTable'),
  segmentStatsBar: document.getElementById('segmentStatsBar'),
  plotWelchPSD: document.getElementById('plotWelchPSD'),
  plotWelch1DCoh: document.getElementById('plotWelch1DCoh'),
  chkLSSeries1: document.getElementById('chkLSSeries1'),
  chkWelchSeries1: document.getElementById('chkWelchSeries1'),
  chkLSSeries2: document.getElementById('chkLSSeries2'),
  chkWelchSeries2: document.getElementById('chkWelchSeries2'),
  inputGuidelineVal: document.getElementById('inputGuidelineVal'),
  selectGuidelineUnit: document.getElementById('selectGuidelineUnit'),
  inputGuidelineLabel: document.getElementById('inputGuidelineLabel'),
  inputGuidelineColor: document.getElementById('inputGuidelineColor'),
  btnAddGuideline: document.getElementById('btnAddGuideline'),
  guidelinesList: document.getElementById('guidelinesList'),
  
  // View 3 (2D Dual-Frequency Coherence) Elements
  series1Select: document.getElementById('series1Select'),
  series2Select: document.getElementById('series2Select'),
  series2Container: document.getElementById('series2Container'),
  lengthInput: document.getElementById('lengthInput'),
  lengthSlider: document.getElementById('lengthSlider'),
  chips: document.querySelectorAll('#sidebarDual2D .chip[data-l]'),
  segBtns: document.querySelectorAll('.seg-btn'),
  harmonicsSelect: document.getElementById('harmonicsSelect'),
  customPeriodsInput: document.getElementById('customPeriodsInput'),
  btnApplyCustomLines: document.getElementById('btnApplyCustomLines'),
  mcContainer: document.getElementById('mcContainer'),
  mcInput: document.getElementById('mcInput'),
  mcSlider: document.getElementById('mcSlider'),
  chipsMC: document.querySelectorAll('#sidebarDual2D .chip-mc[data-mc]'),
  fminInput: document.getElementById('fminInput'),
  fmaxInput: document.getElementById('fmaxInput'),
  btnCompute: document.getElementById('btnCompute'),
  btnSaveParams: document.getElementById('btnSaveParams'),
  loadParamsFile: document.getElementById('loadParamsFile'),
  btnResetZoom: document.getElementById('btnResetZoom'),
  btnToggleFalContours: document.getElementById('btnToggleFalContours'),
  plotMatrix: document.getElementById('plotMatrix'),
  plotHorizontal: document.getElementById('plotHorizontal'),
  plotAntiDiagonal: document.getElementById('plotAntiDiagonal'),
  btnExportHorizCSV: document.getElementById('btnExportHorizCSV'),
  btnExportBeatCSV: document.getElementById('btnExportBeatCSV'),
  btnHorizLayoutSingle: document.getElementById('btnHorizLayoutSingle'),
  btnHorizLayoutSubpanels: document.getElementById('btnHorizLayoutSubpanels'),
  selectSingleHorizCut: document.getElementById('selectSingleHorizCut'),
  
  // Horizontal Cuts Controls (View 3)
  inputCustomCutFreq: document.getElementById('inputCustomCutFreq'),
  selectCustomCutUnit: document.getElementById('selectCustomCutUnit'),
  btnAddHorizontalCut: document.getElementById('btnAddHorizontalCut'),
  horizontalCutsList: document.getElementById('horizontalCutsList'),

  // Automated Peak Detector Elements (View 3)
  peakFapFilter: document.getElementById('peakFapFilter'),
  btnRescanPeaks: document.getElementById('btnRescanPeaks'),
  peakDetectorTbody: document.getElementById('peakDetectorTbody'),

  // Metrics Readouts (View 3)
  mF1: document.getElementById('mF1'),
  mP1: document.getElementById('mP1'),
  mF2: document.getElementById('mF2'),
  mP2: document.getElementById('mP2'),
  mZ: document.getElementById('mZ'),
  mSigBadge: document.getElementById('mSigBadge'),
  m2R: document.getElementById('m2R'),
  m2RP: document.getElementById('m2RP'),
  mDeltaF: document.getElementById('mDeltaF'),
  mFmid: document.getElementById('mFmid'),
  mPmid: document.getElementById('mPmid'),
  mPbeat: document.getElementById('mPbeat'),
  mFap01: document.getElementById('mFap01'),
  mFap1: document.getElementById('mFap1'),
  mFap5: document.getElementById('mFap5'),
  
  // Upload Modal Elements
  btnOpenUploadModal: document.getElementById('btnOpenUploadModal'),
  uploadModal: document.getElementById('uploadModal'),
  btnCloseUploadModal: document.getElementById('btnCloseUploadModal'),
  btnCancelUpload: document.getElementById('btnCancelUpload'),
  uploadDropzone: document.getElementById('uploadDropzone'),
  uploadFileInput: document.getElementById('uploadFileInput'),
  uploadDelimiter: document.getElementById('uploadDelimiter'),
  uploadCommentChar: document.getElementById('uploadCommentChar'),
  uploadErrorAlert: document.getElementById('uploadErrorAlert'),
  uploadPreviewSection: document.getElementById('uploadPreviewSection'),
  uploadStatsSummary: document.getElementById('uploadStatsSummary'),
  uploadDatasetName: document.getElementById('uploadDatasetName'),
  uploadTimeColSelect: document.getElementById('uploadTimeColSelect'),
  uploadTimeUnit: document.getElementById('uploadTimeUnit'),
  uploadProtInput: document.getElementById('uploadProtInput'),
  uploadSeriesTable: document.getElementById('uploadSeriesTable'),
  uploadSeriesTbody: document.getElementById('uploadSeriesTbody'),
  uploadPreviewTableContainer: document.getElementById('uploadPreviewTableContainer'),
  btnConfirmUpload: document.getElementById('btnConfirmUpload'),

  // Granular Export Modal Elements
  exportModal: document.getElementById('exportModal'),
  btnCloseExportModal: document.getElementById('btnCloseExportModal'),
  btnCancelExport: document.getElementById('btnCancelExport'),
  btnRunExport: document.getElementById('btnRunExport'),
  chkExpHeatmap: document.getElementById('chkExpHeatmap'),
  chkExpDiagonal: document.getElementById('chkExpDiagonal'),
  chkExpHorizontal: document.getElementById('chkExpHorizontal'),
  chkExpComposite: document.getElementById('chkExpComposite'),
  chkExpCSV: document.getElementById('chkExpCSV'),
  exportColormap: document.getElementById('exportColormap'),
  exportHarmonicsCount: document.getElementById('exportHarmonicsCount'),
  exportResultsSection: document.getElementById('exportResultsSection'),
  exportFilesList: document.getElementById('exportFilesList'),

  // Tab 3 Custom Segments Controls
  dualSegSourceControl: document.getElementById('dualSegSourceControl'),
  dualUniformControls: document.getElementById('dualUniformControls'),
  dualTab2Badge: document.getElementById('dualTab2Badge'),
  dualTab2KBadge: document.getElementById('dualTab2KBadge'),
  dualTab2Desc: document.getElementById('dualTab2Desc'),
  dualTab2Neff: document.getElementById('dualTab2Neff'),
  dualTab22R: document.getElementById('dualTab22R'),
  btnSyncFromTab2: document.getElementById('btnSyncFromTab2'),

  toast: document.getElementById('toast')
};

// -----------------------------------------------------------------------------
// TOAST NOTIFICATIONS
// -----------------------------------------------------------------------------
function showToast(msg, duration = 3200) {
  if (!el.toast) return;
  el.toast.textContent = msg;
  el.toast.classList.add('show');
  setTimeout(() => el.toast.classList.remove('show'), duration);
}

// -----------------------------------------------------------------------------
// UPLOAD DATASET MODAL & FILE INSPECTOR
// -----------------------------------------------------------------------------
let pendingUpload = {
  filename: '',
  content: '',
  preview: null
};

function initUploadModal() {
  if (!el.btnOpenUploadModal) return;

  el.btnOpenUploadModal.addEventListener('click', () => {
    resetUploadModal();
    el.uploadModal.style.display = 'flex';
  });

  if (el.btnCloseUploadModal) {
    el.btnCloseUploadModal.addEventListener('click', () => {
      el.uploadModal.style.display = 'none';
    });
  }

  if (el.btnCancelUpload) {
    el.btnCancelUpload.addEventListener('click', () => {
      el.uploadModal.style.display = 'none';
    });
  }

  if (el.uploadDropzone && el.uploadFileInput) {
    el.uploadDropzone.addEventListener('click', () => {
      el.uploadFileInput.click();
    });

    el.uploadFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) handleFileSelected(file);
    });

    el.uploadDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      el.uploadDropzone.classList.add('dragover');
    });

    el.uploadDropzone.addEventListener('dragleave', () => {
      el.uploadDropzone.classList.remove('dragover');
    });

    el.uploadDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      el.uploadDropzone.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFileSelected(e.dataTransfer.files[0]);
      }
    });
  }

  if (el.btnConfirmUpload) {
    el.btnConfirmUpload.addEventListener('click', confirmAndIngestDataset);
  }
}

function resetUploadModal() {
  pendingUpload = { filename: '', content: '', preview: null };
  if (el.uploadFileInput) el.uploadFileInput.value = '';
  if (el.uploadDropzone) el.uploadDropzone.style.display = 'block';
  if (el.uploadPreviewSection) el.uploadPreviewSection.style.display = 'none';
  if (el.btnConfirmUpload) el.btnConfirmUpload.style.display = 'none';
  if (el.uploadErrorAlert) {
    el.uploadErrorAlert.style.display = 'none';
    el.uploadErrorAlert.textContent = '';
  }
}

async function handleFileSelected(file) {
  showToast(`Reading ${file.name}...`);
  if (el.uploadErrorAlert) {
    el.uploadErrorAlert.style.display = 'none';
    el.uploadErrorAlert.textContent = '';
  }
  const reader = new FileReader();
  reader.onload = async (evt) => {
    const text = evt.target.result;
    pendingUpload.filename = file.name;
    pendingUpload.content = text;
    await inspectUploadedContent(file.name, text);
  };
  reader.readAsText(file);
}

async function inspectUploadedContent(filename, text) {
  try {
    showToast('Inspecting columns and sampling properties...');
    const delim = (el.uploadDelimiter && el.uploadDelimiter.value !== 'auto') ? el.uploadDelimiter.value : null;
    const commentChar = (el.uploadCommentChar && el.uploadCommentChar.value.trim()) ? el.uploadCommentChar.value.trim() : '#';

    const res = await fetch('/api/upload_preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: filename,
        content: text,
        delimiter: delim,
        comment_char: commentChar
      })
    });
    const data = await res.json();
    if (data.status === 'ok') {
      if (el.uploadErrorAlert) el.uploadErrorAlert.style.display = 'none';
      pendingUpload.preview = data.preview;
      renderUploadPreview(data.preview);
    } else {
      if (el.uploadErrorAlert) {
        el.uploadErrorAlert.style.display = 'block';
        el.uploadErrorAlert.innerHTML = `<strong>Inspection Error:</strong> ${data.message}`;
      }
      showToast(`Preview Error: ${data.message}`);
    }
  } catch (err) {
    console.error('Upload preview error:', err);
    if (el.uploadErrorAlert) {
      el.uploadErrorAlert.style.display = 'block';
      el.uploadErrorAlert.innerHTML = `<strong>Network / Parse Error:</strong> ${err.message || 'Failed to inspect dataset file.'}`;
    }
    showToast('Failed to inspect dataset file.');
  }
}

function reInspectUpload() {
  if (pendingUpload.content && pendingUpload.filename) {
    inspectUploadedContent(pendingUpload.filename, pendingUpload.content);
  }
}

function renderUploadPreview(prev) {
  el.uploadDropzone.style.display = 'none';
  el.uploadPreviewSection.style.display = 'block';
  el.btnConfirmUpload.style.display = 'inline-flex';

  el.uploadDatasetName.value = prev.dataset_name;
  el.uploadProtInput.value = prev.p_rot_guess || 27.28;

  // Stats summary banner
  el.uploadStatsSummary.innerHTML = `
    <span>File: <strong>${prev.filename}</strong></span>
    <span>Observations: <strong>${prev.n_pts.toLocaleString()}</strong></span>
    <span>Time Span: <strong>${prev.t_span.toFixed(1)} days</strong> (${(prev.t_span / 365.25).toFixed(2)} yr)</span>
    <span>Median Cadence: <strong>${prev.cadence.toFixed(2)} days</strong></span>
    <span>Seasonal Gaps (&gt;30d): <strong>${prev.gaps_count}</strong></span>
  `;

  // Time Column selector
  el.uploadTimeColSelect.innerHTML = '';
  prev.all_columns.forEach(col => {
    const opt = document.createElement('option');
    opt.value = col;
    opt.textContent = col + (col === prev.suggested_time_col ? ' (Detected Time)' : '');
    if (col === prev.suggested_time_col) opt.selected = true;
    el.uploadTimeColSelect.appendChild(opt);
  });

  // Series mapping table
  el.uploadSeriesTbody.innerHTML = '';
  const seriesKeys = Object.keys(prev.candidate_series);
  seriesKeys.forEach(sKey => {
    const s = prev.candidate_series[sKey];
    const tr = document.createElement('tr');
    tr.dataset.col = s.col;

    // Build error column select options
    let errOptions = '<option value="">None (auto standard deviation)</option>';
    prev.error_cols.forEach(ec => {
      const isSel = ec === s.err ? 'selected' : '';
      errOptions += `<option value="${ec}" ${isSel}>${ec}</option>`;
    });

    tr.innerHTML = `
      <td><input type="checkbox" class="series-check" checked data-col="${s.col}"></td>
      <td><code>${s.col}</code></td>
      <td><input type="text" class="series-label-input" value="${s.label}"></td>
      <td><input type="text" class="series-unit-input" value="${s.unit}" style="width: 70px;"></td>
      <td><select class="series-err-select">${errOptions}</select></td>
    `;
    el.uploadSeriesTbody.appendChild(tr);
  });

  // 5-Row Data Preview Table
  if (prev.preview_rows && prev.preview_rows.length > 0) {
    const cols = prev.all_columns;
    let tableHtml = '<table class="upload-data-preview-table"><thead><tr>';
    cols.forEach(c => tableHtml += `<th>${c}</th>`);
    tableHtml += '</tr></thead><tbody>';
    prev.preview_rows.forEach(row => {
      tableHtml += '<tr>';
      cols.forEach(c => {
        const val = row[c] !== null && row[c] !== undefined ? row[c] : '—';
        tableHtml += `<td>${typeof val === 'number' ? val.toFixed(4) : val}</td>`;
      });
      tableHtml += '</tr>';
    });
    tableHtml += '</tbody></table>';
    el.uploadPreviewTableContainer.innerHTML = tableHtml;
  }
}

async function confirmAndIngestDataset() {
  if (!pendingUpload.content) return;

  const datasetName = el.uploadDatasetName.value.trim() || 'Uploaded Dataset';
  const pRot = parseFloat(el.uploadProtInput.value) || 27.28;
  const timeCol = el.uploadTimeColSelect.value;
  const timeUnit = el.uploadTimeUnit.value.trim() || 'days';

  // Harvest series mappings
  const seriesMapping = {};
  const rows = el.uploadSeriesTbody.querySelectorAll('tr');
  rows.forEach(tr => {
    const chk = tr.querySelector('.series-check');
    if (chk && chk.checked) {
      const col = tr.dataset.col;
      const lbl = tr.querySelector('.series-label-input').value.trim() || col;
      const unit = tr.querySelector('.series-unit-input').value.trim() || 'unit';
      const err = tr.querySelector('.series-err-select').value || null;
      seriesMapping[col] = {
        col: col,
        label: lbl,
        unit: unit,
        err: err
      };
    }
  });

  if (Object.keys(seriesMapping).length === 0) {
    showToast('Please check at least one indicator channel to include.');
    return;
  }

  try {
    el.btnConfirmUpload.classList.add('loading');
    el.btnConfirmUpload.querySelector('.btn-text').textContent = 'Ingesting...';

    const delim = (el.uploadDelimiter && el.uploadDelimiter.value !== 'auto') ? el.uploadDelimiter.value : null;
    const commentChar = (el.uploadCommentChar && el.uploadCommentChar.value.trim()) ? el.uploadCommentChar.value.trim() : '#';

    const payload = {
      filename: pendingUpload.filename,
      content: pendingUpload.content,
      delimiter: delim,
      comment_char: commentChar,
      dataset_name: datasetName,
      p_rot: pRot,
      time_col: timeCol,
      time_unit: timeUnit,
      series_mapping: seriesMapping
    };

    const res = await fetch('/api/confirm_upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (data.status === 'ok') {
      state.datasets = data.available_datasets;
      state.currentDataset = data.dataset_key;
      populateDatasetUI();
      el.uploadModal.style.display = 'none';
      showToast(`Dataset '${datasetName}' ingested successfully!`);

      // Switch to Time Series view & auto-run diagnostics on the new dataset
      switchView('timeseries');
      computeTimeseriesDiagnostics();
    } else {
      showToast(`Error: ${data.message}`);
    }
  } catch (err) {
    console.error('Ingestion error:', err);
    showToast('Failed to ingest dataset.');
  } finally {
    el.btnConfirmUpload.classList.remove('loading');
    el.btnConfirmUpload.querySelector('.btn-text').textContent = 'Confirm & Ingest Dataset';
  }
}

// -----------------------------------------------------------------------------
// DUAL-COHERENCE TAB 2 SEGMENT BADGE HELPER
// -----------------------------------------------------------------------------
function updateDualTab2Badge() {
  if (!el.dualTab2Badge) return;
  if (state.welch1DData) {
    const w = state.welch1DData;
    if (el.dualTab2KBadge) el.dualTab2KBadge.textContent = `K = ${w.k_segs}`;
    if (el.dualTab2Neff) el.dualTab2Neff.textContent = w.neff.toFixed(2);
    if (el.dualTab22R) el.dualTab22R.textContent = `${w.two_r.toFixed(4)} d⁻¹`;
    if (el.dualTab2Desc) el.dualTab2Desc.textContent = `Using active segments from Tab 2 (${w.k_segs} segments, mean length ${w.mean_l ? Math.round(w.mean_l) : ''} pts, 100% data kept).`;
  } else {
    if (el.dualTab2KBadge) el.dualTab2KBadge.textContent = `Adaptive (Auto)`;
    if (el.dualTab2Neff) el.dualTab2Neff.textContent = `Auto`;
    if (el.dualTab22R) el.dualTab22R.textContent = `Auto`;
    if (el.dualTab2Desc) el.dualTab2Desc.textContent = `Will autocalculate Adaptive Segments on ${state.currentDataset} (or configure in Tab 2).`;
  }
}

// -----------------------------------------------------------------------------
// TOOLBOX LANDING PAGE & SUMMARY STATS
// -----------------------------------------------------------------------------
function updateLandingStats() {
  const ds = state.datasets[state.currentDataset];
  if (!ds) return;
  if (el.landingDatasetName) el.landingDatasetName.textContent = ds.name || state.currentDataset;
  
  if (state.diagnosticsData && state.diagnosticsData.dt_stats) {
    const s = state.diagnosticsData.dt_stats;
    if (el.landingN) el.landingN.textContent = s.n_pts ? s.n_pts.toLocaleString() : '—';
    if (el.landingTspan) el.landingTspan.textContent = s.t_span ? `${s.t_span.toFixed(1)} days (${(s.t_span/365.25).toFixed(2)} yr)` : '—';
    if (el.landingCadence) el.landingCadence.textContent = s.median_cadence ? `${s.median_cadence.toFixed(2)} days` : '—';
  } else if (state.coherenceData && state.slicesData) {
    if (el.landingN && el.statN && el.statN.textContent !== '—') el.landingN.textContent = el.statN.textContent;
    else if (el.landingN && ds.n_pts) el.landingN.textContent = ds.n_pts.toLocaleString();
    if (el.landingTspan && ds.t_span) el.landingTspan.textContent = `${ds.t_span.toFixed(1)} days (${(ds.t_span/365.25).toFixed(2)} yr)`;
    if (el.landingCadence && ds.cadence) el.landingCadence.textContent = `${ds.cadence.toFixed(2)} days`;
  } else {
    if (el.landingN) el.landingN.textContent = ds.n_pts ? ds.n_pts.toLocaleString() : '—';
    if (el.landingTspan) el.landingTspan.textContent = ds.t_span ? `${ds.t_span.toFixed(1)} days` : '—';
    if (el.landingCadence) el.landingCadence.textContent = ds.cadence ? `${ds.cadence.toFixed(2)} days` : '—';
  }
  
  const pRot = (state.coherenceData && state.coherenceData.p_rot) || ds.p_rot;
  if (el.landingProt && pRot) el.landingProt.textContent = `${pRot.toFixed(2)} days`;
}

// -----------------------------------------------------------------------------
// INITIALIZATION & DATASET MANAGEMENT
// -----------------------------------------------------------------------------
async function initApp() {
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'light') {
    document.body.classList.add('light-theme');
    updateThemeUI(true);
  } else {
    document.body.classList.remove('light-theme');
    updateThemeUI(false);
  }

  try {
    const res = await fetch('/api/datasets');
    const data = await res.json();
    if (data.status === 'ok') {
      state.datasets = data.datasets;
      populateDatasetUI();
      setupEventListeners();
      switchView('landing');
      updateLandingStats();
      runComputation();
    } else {
      showToast('Error loading datasets catalogue.');
    }
  } catch (err) {
    console.error('Initialization error:', err);
    showToast('Failed to connect to backend server.');
  }
}

// -----------------------------------------------------------------------------
// THEME & DISPLAY HELPERS
// -----------------------------------------------------------------------------
function getSeriesLabel(key, ds = state.datasets[state.currentDataset]) {
  if (!ds || !ds.series || !ds.series[key]) return key;
  const s = ds.series[key];
  if (typeof s === 'string') return s;
  if (typeof s === 'object') {
    if (s.label && s.unit) return `${s.label} (${s.unit})`;
    if (s.label) return s.label;
  }
  return String(key);
}

function getThemeColors() {
  const isLight = document.body.classList.contains('light-theme');
  if (isLight) {
    return {
      isLight: true,
      paperBg: '#FFFFFF',
      plotBg: '#FFFFFF',
      gridColor: '#E5E7EB',
      axisLineColor: '#0F172A',
      titleColor: '#0F172A',
      tickColor: '#0F172A',
      legendBg: 'rgba(255, 255, 255, 0.96)',
      legendBorder: '#CBD5E1',
      legendText: '#0F172A',
      harmonicLine: '#475569',
      harmonicBand: 'rgba(71, 85, 105, 0.12)'
    };
  } else {
    return {
      isLight: false,
      paperBg: '#111827',
      plotBg: '#161F30',
      gridColor: '#243046',
      axisLineColor: '#64748B',
      titleColor: '#FFFFFF',
      tickColor: '#94A3B8',
      legendBg: 'rgba(22, 31, 48, 0.85)',
      legendBorder: '#374151',
      legendText: '#F3F4F6',
      harmonicLine: '#94A3B8',
      harmonicBand: 'rgba(148, 163, 184, 0.12)'
    };
  }
}

function toggleTheme() {
  const isCurrentlyLight = document.body.classList.toggle('light-theme');
  localStorage.setItem('theme', isCurrentlyLight ? 'light' : 'dark');
  updateThemeUI(isCurrentlyLight);

  // Re-render active view plots
  if (state.activeView === 'timeseries' && state.diagnosticsData) {
    renderTimeSeriesPlot();
    renderCadenceAndWindowPlots();
    renderLSSpectraPlot();
  } else if (state.activeView === 'welch1d' && state.welch1DData) {
    renderSegmentTimeline();
    renderWelchPSDPlot();
    renderWelch1DCohPlot();
  } else if (state.activeView === 'dual2d' && state.coherenceData) {
    renderMatrixPlot();
    renderHorizontalCut();
    renderAntiDiagonalCut();
  }
}

function updateThemeUI(isLight) {
  if (el.themeIconSun) el.themeIconSun.style.display = isLight ? 'none' : 'inline-block';
  if (el.themeIconMoon) el.themeIconMoon.style.display = isLight ? 'inline-block' : 'none';
  if (el.themeLabel) el.themeLabel.textContent = isLight ? 'Dark' : 'Light';
}

function populateDatasetUI() {
  if (el.datasetSelect && state.datasets) {
    el.datasetSelect.innerHTML = '';
    Object.keys(state.datasets).forEach((dKey) => {
      const dCfg = state.datasets[dKey];
      const opt = document.createElement('option');
      opt.value = dKey;
      opt.textContent = dCfg.name + (dCfg.is_custom ? ' ★ (User Upload)' : '');
      if (dKey === state.currentDataset) opt.selected = true;
      el.datasetSelect.appendChild(opt);
    });
  }

  const ds = state.datasets[state.currentDataset];
  if (!ds) return;

  // View 3 (Dual 2D) Dropdowns
  el.series1Select.innerHTML = '';
  el.series2Select.innerHTML = '';
  // View 2 (Welch 1D) Dropdowns
  if (el.welchSeries1Select) el.welchSeries1Select.innerHTML = '';
  if (el.welchSeries2Select) el.welchSeries2Select.innerHTML = '';

  const seriesKeys = Object.keys(ds.series);
  seriesKeys.forEach((key, idx) => {
    const labelText = getSeriesLabel(key, ds);

    const opt1 = document.createElement('option');
    opt1.value = key;
    opt1.textContent = labelText;
    if (key === state.series1 || (idx === 0 && !ds.series[state.series1])) opt1.selected = true;
    el.series1Select.appendChild(opt1);

    const opt2 = document.createElement('option');
    opt2.value = key;
    opt2.textContent = labelText;
    if (key === state.series2 || (idx === 1 && !ds.series[state.series2])) opt2.selected = true;
    el.series2Select.appendChild(opt2);

    if (el.welchSeries1Select) {
      const wOpt1 = document.createElement('option');
      wOpt1.value = key;
      wOpt1.textContent = labelText;
      if (key === state.welchSeries1 || (idx === 0 && !ds.series[state.welchSeries1])) wOpt1.selected = true;
      el.welchSeries1Select.appendChild(wOpt1);
    }

    if (el.welchSeries2Select) {
      const wOpt2 = document.createElement('option');
      wOpt2.value = key;
      wOpt2.textContent = labelText;
      if (key === state.welchSeries2 || (idx === 1 && !ds.series[state.welchSeries2])) wOpt2.selected = true;
      el.welchSeries2Select.appendChild(wOpt2);
    }
  });

  state.series1 = el.series1Select.value;
  state.series2 = el.series2Select.value;
  if (el.welchSeries1Select) state.welchSeries1 = el.welchSeries1Select.value;
  if (el.welchSeries2Select) state.welchSeries2 = el.welchSeries2Select.value;

  // Ensure distinct series in 1D
  ensureDistinct1DSeries();

  // Presets
  el.presetSelect.innerHTML = '';
  Object.keys(ds.presets).forEach((key) => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = ds.presets[key];
    if (key === state.preset) opt.selected = true;
    el.presetSelect.appendChild(opt);
  });
  state.preset = el.presetSelect.value;
  populateIndicatorCheckboxes();
}

function ensureDistinct1DSeries() {
  if (!el.welchSeries1Select || !el.welchSeries2Select) return;
  let s1 = el.welchSeries1Select.value;
  let s2 = el.welchSeries2Select.value;
  if (s1 === s2) {
    const opts = Array.from(el.welchSeries2Select.options);
    const alt = opts.find(o => o.value !== s1);
    if (alt) {
      el.welchSeries2Select.value = alt.value;
      state.welchSeries2 = alt.value;
      s2 = alt.value;
    }
  }
  // Disable identical series across both dropdowns to prevent selecting 1D autocoherence
  Array.from(el.welchSeries2Select.options).forEach(opt => {
    opt.disabled = (opt.value === s1);
  });
  Array.from(el.welchSeries1Select.options).forEach(opt => {
    opt.disabled = (opt.value === s2);
  });
}

function populateIndicatorCheckboxes() {
  if (!el.tsIndicatorGroup) return;
  const ds = state.datasets[state.currentDataset];
  if (!ds) return;

  el.tsIndicatorGroup.innerHTML = '';
  const seriesKeys = Object.keys(ds.series);
  state.selectedIndicators = (state.selectedIndicators || []).filter(k => seriesKeys.includes(k));
  if (state.selectedIndicators.length === 0) {
    state.selectedIndicators = seriesKeys.slice(0, Math.min(3, seriesKeys.length));
  }

  seriesKeys.forEach((key) => {
    const lbl = document.createElement('label');
    lbl.className = 'checkbox-label';
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.value = key;
    chk.checked = state.selectedIndicators.includes(key);
    chk.addEventListener('change', () => {
      if (chk.checked) {
        if (!state.selectedIndicators.includes(key)) state.selectedIndicators.push(key);
      } else {
        state.selectedIndicators = state.selectedIndicators.filter(k => k !== key);
      }
      if (state.diagnosticsData) {
        renderTimeSeriesPlot();
        renderLSSpectraPlot();
      }
    });

    const span = document.createElement('span');
    span.textContent = getSeriesLabel(key, ds);
    lbl.appendChild(chk);
    lbl.appendChild(span);
    el.tsIndicatorGroup.appendChild(lbl);
  });
}

// -----------------------------------------------------------------------------
// VIEW NAVIGATION & MULTI-VIEW COORDINATION
// -----------------------------------------------------------------------------
function initViewTabs() {
  if (!el.viewTabs) return;
  const tabBtns = el.viewTabs.querySelectorAll('.tab-btn');
  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetView = btn.dataset.view;
      switchView(targetView);
    });
  });
}

function switchView(viewName) {
  state.activeView = viewName;
  if (el.viewTabs) {
    el.viewTabs.querySelectorAll('.tab-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.view === viewName);
    });
  }

  // Show/hide view content panels
  if (el.viewLanding) {
    el.viewLanding.classList.toggle('active', viewName === 'landing');
    el.viewLanding.style.display = viewName === 'landing' ? 'block' : 'none';
  }
  if (el.viewTimeseries) {
    el.viewTimeseries.classList.toggle('active', viewName === 'timeseries');
    el.viewTimeseries.style.display = viewName === 'timeseries' ? 'block' : 'none';
  }
  if (el.viewWelch1D) {
    el.viewWelch1D.classList.toggle('active', viewName === 'welch1d');
    el.viewWelch1D.style.display = viewName === 'welch1d' ? 'block' : 'none';
  }
  if (el.viewDual2D) {
    el.viewDual2D.classList.toggle('active', viewName === 'dual2d');
    el.viewDual2D.style.display = viewName === 'dual2d' ? 'block' : 'none';
  }
  if (el.viewComparison) {
    el.viewComparison.classList.toggle('active', viewName === 'comparison');
    el.viewComparison.style.display = viewName === 'comparison' ? 'block' : 'none';
  }

  // Contextual sidebars: show ONLY controls relevant to the active tab
  if (el.sidebarTimeseries) el.sidebarTimeseries.style.display = viewName === 'timeseries' ? 'flex' : 'none';
  if (el.sidebarWelch1D) el.sidebarWelch1D.style.display = viewName === 'welch1d' ? 'flex' : 'none';
  if (el.sidebarDual2D) el.sidebarDual2D.style.display = viewName === 'dual2d' ? 'flex' : 'none';
  if (el.sidebarComparison) el.sidebarComparison.style.display = viewName === 'comparison' ? 'flex' : 'none';

  // Palette & Contrast selectors are relevant for the 2D matrix
  if (el.paletteContainer) {
    el.paletteContainer.style.display = (viewName === 'dual2d' || viewName === 'comparison') ? 'flex' : 'none';
  }
  if (el.contrastContainer) {
    el.contrastContainer.style.display = (viewName === 'dual2d' || viewName === 'comparison') ? 'flex' : 'none';
  }

  // Trigger calculation or resize for newly active view
  if (viewName === 'landing') {
    updateLandingStats();
  } else if (viewName === 'timeseries') {
    if (!state.diagnosticsData) {
      computeTimeseriesDiagnostics();
    } else {
      renderTimeSeriesPlot();
      renderCadenceAndWindowPlots();
      renderLSSpectraPlot();
      setTimeout(() => {
        Plotly.Plots.resize(el.plotTimeSeries);
        Plotly.Plots.resize(el.plotCadenceHist);
        Plotly.Plots.resize(el.plotSpectralWindow);
        Plotly.Plots.resize(el.plotLSSpectra);
      }, 50);
    }
  } else if (viewName === 'welch1d') {
    if (!state.welch1DData) {
      computeWelch1D();
    } else {
      renderSegmentTimeline();
      renderWelchPSDPlot();
      renderWelch1DCohPlot();
      setTimeout(() => {
        Plotly.Plots.resize(el.plotSegmentTimeline);
        Plotly.Plots.resize(el.plotWelchPSD);
        Plotly.Plots.resize(el.plotWelch1DCoh);
      }, 50);
    }
  } else if (viewName === 'comparison') {
    if (!state.comparisonData) {
      runComparisonComputation();
    } else {
      renderComparisonView();
      setTimeout(() => {
        if (el.plotCompTimelineA) Plotly.Plots.resize(el.plotCompTimelineA);
        if (el.plotCompTimelineB) Plotly.Plots.resize(el.plotCompTimelineB);
        if (el.plotCompMapA) Plotly.Plots.resize(el.plotCompMapA);
        if (el.plotCompMapB) Plotly.Plots.resize(el.plotCompMapB);
        if (el.plotCompMapDelta) Plotly.Plots.resize(el.plotCompMapDelta);
        if (el.plotCompHorizSlice) Plotly.Plots.resize(el.plotCompHorizSlice);
        if (el.plotCompAntiDiagSlice) Plotly.Plots.resize(el.plotCompAntiDiagSlice);
        if (el.plotComp1DCohA) Plotly.Plots.resize(el.plotComp1DCohA);
        if (el.plotComp1DCohB) Plotly.Plots.resize(el.plotComp1DCohB);
      }, 50);
    }
  } else {
    if (state.coherenceData) {
      renderMatrixPlot();
      renderHorizontalCut();
      renderAntiDiagonalCut();
      renderHorizontalCutsList();
      if (state.slicesData && state.slicesData.detected_peaks) {
        renderPeakDetectorTable(state.slicesData.detected_peaks);
      }
    }
    setTimeout(() => {
      Plotly.Plots.resize(el.plotMatrix);
      Plotly.Plots.resize(el.plotHorizontal);
      Plotly.Plots.resize(el.plotAntiDiagonal);
    }, 50);
  }
}

// -----------------------------------------------------------------------------
// VIEW 1: TIME SERIES OBSERVATIONS & SPECTRAL DIAGNOSTICS
// -----------------------------------------------------------------------------
async function computeTimeseriesDiagnostics() {
  showToast('Computing time series observations & spectral window diagnostics...');
  try {
    const f_win = (el.fwinMaxInput && el.fwinMaxInput.value) ? (parseFloat(el.fwinMaxInput.value) || 1.5) : (state.fwinMax || 1.5);
    const payload = {
      dataset: state.currentDataset,
      preset: state.preset,
      fmin: parseFloat(el.tsFminInput ? el.tsFminInput.value : 0.0) || 0.0,
      fmax: parseFloat(el.tsFmaxInput ? el.tsFmaxInput.value : 0.15) || 0.15,
      f_win_max: f_win
    };
    const res = await fetch('/api/timeseries_diagnostics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.status === 'ok') {
      state.diagnosticsData = data.diagnostics;
      if (el.statN && data.diagnostics.dt_stats) {
        el.statN.textContent = data.diagnostics.dt_stats.n_pts.toLocaleString();
      }
      if (el.statProt && data.diagnostics.p_rot) {
        el.statProt.textContent = `${data.diagnostics.p_rot.toFixed(2)} d`;
      }
      renderTimeSeriesPlot();
      renderCadenceAndWindowPlots();
      renderLSSpectraPlot();
      showToast('Time series diagnostics ready.');
    } else {
      showToast('Diagnostics error: ' + data.message);
    }
  } catch (err) {
    console.error('Diagnostics error:', err);
    showToast('Failed to compute time series diagnostics.');
  }
}

const TS_COLORS = {
  'RV': '#3B82F6',
  'rv': '#3B82F6',
  'FWHM': '#10B981',
  'delta_fwhm_sq': '#10B981',
  'logRHK': '#F59E0B',
  'SMW': '#8B5CF6',
  'CaIIHK': '#8B5CF6',
  'BIS': '#EC4899',
  'Ha06_1': '#EF4444',
  'NaI': '#06B6D4',
  'HeI_2': '#F97316',
  'Contrast': '#14B8A6',
  'Mg2': '#A855F7',
  'R': '#F59E0B',
  'Lya': '#3B82F6',
  'F10_7': '#EC4899'
};

const PALETTE_CYCLE = [
  '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899',
  '#06B6D4', '#EF4444', '#84CC16', '#6366F1', '#14B8A6',
  '#F97316', '#A855F7', '#D946EF', '#0EA5E9', '#EAB308'
];

function getSeriesColor(key, idx = 0) {
  if (TS_COLORS[key]) return TS_COLORS[key];
  const low = String(key).toLowerCase();
  if (TS_COLORS[low]) return TS_COLORS[low];
  const up = String(key).toUpperCase();
  if (TS_COLORS[up]) return TS_COLORS[up];
  return PALETTE_CYCLE[idx % PALETTE_CYCLE.length];
}

function renderTimeSeriesPlot() {
  if (!state.diagnosticsData || !el.plotTimeSeries) return;
  const tsDict = state.diagnosticsData.time_series;
  let keysToPlot = (state.selectedIndicators || []).filter(k => tsDict[k]);
  if (keysToPlot.length === 0) {
    keysToPlot = Object.keys(tsDict).slice(0, 3);
    state.selectedIndicators = keysToPlot;
    if (el.tsIndicatorGroup) {
      el.tsIndicatorGroup.querySelectorAll('input[type="checkbox"]').forEach(chk => {
        chk.checked = keysToPlot.includes(chk.value);
      });
    }
  }
  if (keysToPlot.length === 0) return;

  const th = getThemeColors();
  const nSub = keysToPlot.length;
  const traces = [];
  const layout = {
    paper_bgcolor: th.paperBg,
    plot_bgcolor: th.plotBg,
    margin: { l: 75, r: 25, t: 25, bottom: 45 },
    showlegend: false
  };

  // Stacked subpanels per indicator (Barnard workspace standard)
  const gap = 0.03;
  const panelHeight = (1.0 - (nSub - 1) * gap) / nSub;

  keysToPlot.forEach((key, idx) => {
    const d = tsDict[key];
    const color = getSeriesColor(key, idx);
    const yaxisName = idx === 0 ? 'yaxis' : `yaxis${idx + 1}`;
    const yaxisRef = idx === 0 ? 'y' : `y${idx + 1}`;

    // Break lines across observing gaps (> 25d) according to workspace rule
    const xBroken = [];
    const yBroken = [];
    const textBroken = [];
    for (let i = 0; i < d.time.length; i++) {
      if (i > 0 && (d.time[i] - d.time[i - 1]) > 25.0) {
        xBroken.push(null);
        yBroken.push(null);
        textBroken.push(null);
      }
      xBroken.push(d.time[i]);
      yBroken.push(d.values[i]);
      textBroken.push((d.time[i] !== null && d.values[i] !== null) ? `Time: ${d.time[i].toFixed(2)} BJD<br>${d.label}: ${d.values[i].toFixed(2)} ${d.unit}` : '');
    }

    traces.push({
      x: xBroken,
      y: yBroken,
      type: 'scatter',
      mode: 'lines+markers',
      connectgaps: false,
      name: d.label,
      line: { color: color, width: 0.9 },
      marker: { size: 3, color: color, opacity: 0.8 },
      yaxis: yaxisRef,
      hoverinfo: 'text',
      text: textBroken
    });

    const yBot = 1.0 - (idx + 1) * panelHeight - idx * gap;
    const yTop = yBot + panelHeight;

    layout[yaxisName] = {
      domain: [Math.max(0, yBot), Math.min(1, yTop)],
      title: { text: `${d.label}<br>[${d.unit}]`, font: { color: th.titleColor, size: 10 } },
      tickfont: { color: th.tickColor, size: 9 },
      gridcolor: th.gridColor,
      showline: true,
      linecolor: th.axisLineColor,
      linewidth: 1.2,
      mirror: true
    };
  });

  layout.xaxis = {
    title: { text: 'Time (BJD)', font: { color: th.titleColor, size: 11 } },
    tickfont: { color: th.tickColor, size: 10 },
    gridcolor: th.gridColor,
    showline: true,
    linecolor: th.axisLineColor,
    linewidth: 1.2,
    mirror: true
  };

  Plotly.react(el.plotTimeSeries, traces, layout, { responsive: true, displayModeBar: false });
}

function renderCadenceAndWindowPlots() {
  if (!state.diagnosticsData) return;
  const diag = state.diagnosticsData;
  const th = getThemeColors();

  // Cadence Histogram
  if (el.plotCadenceHist) {
    const traceHist = {
      x: diag.dt_hist.log_dt,
      type: 'histogram',
      marker: { color: th.isLight ? '#0284C7' : '#00E5FF', opacity: 0.85, line: { color: th.plotBg, width: 0.5 } },
      nbinsx: 20
    };
    const layoutHist = {
      paper_bgcolor: th.paperBg,
      plot_bgcolor: th.plotBg,
      margin: { l: 45, r: 20, t: 15, bottom: 38 },
      xaxis: {
        title: { text: 'log₁₀[Δt (days)]', font: { color: th.titleColor, size: 10 } },
        tickfont: { color: th.tickColor, size: 9 },
        gridcolor: th.gridColor,
        showline: true,
        linecolor: th.axisLineColor,
        linewidth: 1.2,
        mirror: true
      },
      yaxis: {
        title: { text: 'Count', font: { color: th.titleColor, size: 10 } },
        tickfont: { color: th.tickColor, size: 9 },
        gridcolor: th.gridColor,
        showline: true,
        linecolor: th.axisLineColor,
        linewidth: 1.2,
        mirror: true
      }
    };
    Plotly.react(el.plotCadenceHist, [traceHist], layoutHist, { responsive: true, displayModeBar: false });
  }

  // Cadence summary stats box
  if (el.cadenceStatsContent) {
    const st = diag.dt_stats;
    el.cadenceStatsContent.innerHTML = `
      <div class="stat-grid-2col">
        <div class="stat-card-mini"><span class="lbl">Total Observations</span><span class="val">N = ${st.n_pts}</span></div>
        <div class="stat-card-mini"><span class="lbl">Timespan</span><span class="val">${st.t_span_days.toFixed(1)} d (${(st.t_span_days/365.25).toFixed(1)} yr)</span></div>
        <div class="stat-card-mini"><span class="lbl">Median Cadence</span><span class="val">${st.median_dt.toFixed(2)} d</span></div>
        <div class="stat-card-mini"><span class="lbl">Max Observing Gap</span><span class="val">${st.max_dt.toFixed(1)} d</span></div>
      </div>
    `;
  }

  // Spectral Window Function W(f) [Symmetric Barnard Star Standard]
  if (el.plotSpectralWindow) {
    const win = diag.spectral_window;
    const hoverW = win.freq.map((f, i) => {
      const p_str = Math.abs(f) > 1e-4 ? (1.0 / Math.abs(f)).toFixed(2) + ' d' : '∞ (f=0)';
      return `Frequency f: ${f.toFixed(4)} d⁻¹<br>Period |P|: ${p_str}<br>W(f): ${win.power[i].toExponential(3)}`;
    });

    const tracesWin = [{
      x: win.freq,
      y: win.power.map(p => Math.max(1e-4, p)),
      type: 'scatter',
      mode: 'lines',
      line: { color: '#0284C7', width: 1.2 },
      name: 'Lomb-Scargle',
      hoverinfo: 'text',
      text: hoverW
    }];

    if (win.welch_freq && win.welch_freq.length > 0) {
      const hoverWelch = win.welch_freq.map((f, i) => {
        const p_str = Math.abs(f) > 1e-4 ? (1.0 / Math.abs(f)).toFixed(2) + ' d' : '∞ (f=0)';
        return `Frequency f: ${f.toFixed(4)} d⁻¹<br>Period |P|: ${p_str}<br>Welch W(f): ${win.welch_power[i].toExponential(3)}`;
      });
      tracesWin.push({
        x: win.welch_freq,
        y: win.welch_power.map(p => Math.max(1e-4, p)),
        type: 'scatter',
        mode: 'lines',
        line: { color: '#1E3A8A', width: 1.6 },
        name: 'Welch (Kaiser-Bessel)',
        hoverinfo: 'text',
        text: hoverWelch
      });
    }

    const shapes = [];
    win.aliases.forEach((al) => {
      shapes.push({
        type: 'line',
        xref: 'x',
        yref: 'paper',
        x0: al.f,
        x1: al.f,
        y0: 0,
        y1: 1,
        line: { color: al.color, width: 1.0, dash: al.ls === ':' ? 'dot' : 'dash' }
      });
    });

    const minF = win.freq[0];
    const maxF = win.freq[win.freq.length - 1];

    const layoutWin = {
      paper_bgcolor: th.paperBg,
      plot_bgcolor: th.plotBg,
      margin: { l: 45, r: 20, t: 15, bottom: 38 },
      xaxis: {
        title: { text: 'Frequency f (d⁻¹)', font: { color: th.titleColor, size: 10 } },
        tickfont: { color: th.tickColor, size: 9 },
        gridcolor: th.gridColor,
        showline: true,
        linecolor: th.axisLineColor,
        linewidth: 1.2,
        mirror: true,
        range: [minF, maxF]
      },
      yaxis: {
        title: { text: 'W(f) [log]', font: { color: th.titleColor, size: 10 } },
        type: 'log',
        range: [-4, 0.2],
        tickfont: { color: th.tickColor, size: 9 },
        gridcolor: th.gridColor,
        showline: true,
        linecolor: th.axisLineColor,
        linewidth: 1.2,
        mirror: true
      },
      shapes: shapes,
      showlegend: tracesWin.length > 1,
      legend: {
        x: 0.98,
        y: 0.98,
        xanchor: 'right',
        yanchor: 'top',
        bgcolor: th.paperBg,
        bordercolor: th.gridColor,
        borderwidth: 1,
        font: { size: 9, color: th.textColor }
      }
    };
    Plotly.react(el.plotSpectralWindow, tracesWin, layoutWin, { responsive: true, displayModeBar: false });
  }
}

function renderLSSpectraPlot() {
  if (!state.diagnosticsData || !el.plotLSSpectra) return;
  const pgDict = state.diagnosticsData.periodograms;
  let keysToPlot = (state.selectedIndicators || []).filter(k => pgDict[k]);
  if (keysToPlot.length === 0) {
    keysToPlot = Object.keys(pgDict).slice(0, 3);
    state.selectedIndicators = keysToPlot;
  }
  if (keysToPlot.length === 0) return;

  const th = getThemeColors();
  const isPeriod = state.lsDomain === 'period';
  const isLog = state.lsScale === 'log';
  const prot = state.diagnosticsData.p_rot || 27.28;
  const f_rot = 1.0 / prot;

  if (state.lsLayout === 'subpanels') {
    // Stacked subpanels per indicator
    const nSub = keysToPlot.length;
    const gap = 0.03;
    const panelHeight = (1.0 - (nSub - 1) * gap) / nSub;
    const traces = [];
    const layout = {
      paper_bgcolor: th.paperBg,
      plot_bgcolor: th.plotBg,
      margin: { l: 65, r: 25, t: 25, bottom: 45 },
      shapes: [],
      showlegend: false
    };

    keysToPlot.forEach((key, idx) => {
      const pg = pgDict[key];
      const xVals = isPeriod ? pg.period : pg.freq;
      const yVals = isLog ? pg.power.map(p => Math.max(1e-4, p)) : pg.power;
      const color = getSeriesColor(key, idx);
      const yaxisName = idx === 0 ? 'yaxis' : `yaxis${idx + 1}`;
      const yaxisRef = idx === 0 ? 'y' : `y${idx + 1}`;

      const hoverLS = pg.freq.map((f, i) => {
        const p_val = f > 0 ? (1.0 / f).toFixed(2) : '∞';
        return `Period: ${p_val} d<br>Frequency: ${f.toFixed(4)} d⁻¹<br>${pg.label} Power: ${pg.power[i].toFixed(4)}`;
      });

      traces.push({
        x: xVals,
        y: yVals,
        type: 'scatter',
        mode: 'lines',
        name: pg.label,
        line: { color: color, width: 1.2 },
        yaxis: yaxisRef,
        hoverinfo: 'text',
        text: hoverLS
      });

      // Peak star marker
      const peakX = isPeriod ? pg.peak_period : pg.peak_freq;
      traces.push({
        x: [peakX],
        y: [isLog ? Math.max(1e-4, pg.peak_power) : pg.peak_power],
        type: 'scatter',
        mode: 'markers',
        name: `${pg.label} Peak`,
        marker: { color: color, size: 7, symbol: 'star' },
        yaxis: yaxisRef,
        hoverinfo: 'text',
        text: [`Peak: P = ${pg.peak_period.toFixed(2)} d (Power = ${pg.peak_power.toFixed(3)})`]
      });

      const yBot = 1.0 - (idx + 1) * panelHeight - idx * gap;
      const yTop = yBot + panelHeight;

      layout[yaxisName] = {
        domain: [Math.max(0, yBot), Math.min(1, yTop)],
        title: { text: `${pg.label}<br>[Power]`, font: { color: th.titleColor, size: 10 } },
        type: isLog ? 'log' : 'linear',
        tickfont: { color: th.tickColor, size: 9 },
        gridcolor: th.gridColor,
        showline: true,
        linecolor: th.axisLineColor,
        linewidth: 1.2,
        mirror: true
      };

      // FAP lines for this subpanel
      layout.shapes.push(
        { type: 'line', xref: 'paper', yref: yaxisRef, x0: 0, x1: 1, y0: pg.fap01, y1: pg.fap01, line: { color: '#FF2D55', width: 0.9, dash: 'dash' } },
        { type: 'line', xref: 'paper', yref: yaxisRef, x0: 0, x1: 1, y0: pg.fap1,  y1: pg.fap1,  line: { color: '#00E676', width: 0.9, dash: 'dash' } },
        { type: 'line', xref: 'paper', yref: yaxisRef, x0: 0, x1: 1, y0: pg.fap5,  y1: pg.fap5,  line: { color: '#AF52DE', width: 0.9, dash: 'dash' } }
      );

      // Rotation harmonics on each subpanel
      for (let h = 1; h <= 4; h++) {
        const fh = h * f_rot;
        const xh = isPeriod ? (1.0 / fh) : fh;
        layout.shapes.push({
          type: 'line', xref: 'x', yref: yaxisRef,
          x0: xh, x1: xh, y0: isLog ? 1e-4 : 0, y1: pg.peak_power * 1.5,
          line: { color: th.harmonicLine, width: 0.8, dash: 'dashdot' }
        });
      }

      // Custom guide lines on each subpanel
      if (state.customGuidelines && state.customGuidelines.length > 0) {
        state.customGuidelines.forEach(gl => {
          if (!gl.active) return;
          const xPos = isPeriod ? gl.period : gl.freq;
          layout.shapes.push({
            type: 'line', xref: 'x', yref: yaxisRef,
            x0: xPos, x1: xPos, y0: isLog ? 1e-4 : 0, y1: pg.peak_power * 1.5,
            line: { color: gl.color || '#FF9500', width: 1.2, dash: 'dash' }
          });
        });
      }
    });

    const f_start = Math.max(1e-4, parseFloat(el.tsFminInput ? el.tsFminInput.value : state.tsFmin) || 0.0);
    const f_stop = parseFloat(el.tsFmaxInput ? el.tsFmaxInput.value : state.tsFmax) || 0.15;
    const xAxisRange = isPeriod
      ? [Math.max(1.0 / f_stop, 2.0), Math.min(250.0, 1.0 / f_start)]
      : [Math.max(0.0, f_start), f_stop];

    layout.xaxis = {
      title: { text: isPeriod ? 'Period (days)' : 'Frequency f (d⁻¹)', font: { color: th.titleColor, size: 11 } },
      tickfont: { color: th.tickColor, size: 10 },
      gridcolor: th.gridColor,
      showline: true,
      linecolor: th.axisLineColor,
      linewidth: 1.2,
      mirror: true,
      range: xAxisRange,
      autorange: false
    };

    Plotly.react(el.plotLSSpectra, traces, layout, { responsive: true, displayModeBar: false });
  } else {
    // Combined Overlay mode (single panel)
    const traces = [];
    const shapes = [];

    keysToPlot.forEach((key, idx) => {
      const pg = pgDict[key];
      const xVals = isPeriod ? pg.period : pg.freq;
      const yVals = isLog ? pg.power.map(p => Math.max(1e-4, p)) : pg.power;
      const color = getSeriesColor(key, idx);

      const hoverLS = pg.freq.map((f, i) => {
        const p_val = f > 0 ? (1.0 / f).toFixed(2) : '∞';
        return `Period: ${p_val} d<br>Frequency: ${f.toFixed(4)} d⁻¹<br>${pg.label} Power: ${pg.power[i].toFixed(4)}`;
      });

      traces.push({
        x: xVals,
        y: yVals,
        type: 'scatter',
        mode: 'lines',
        name: `${pg.label} (Peak: ${pg.peak_period.toFixed(2)}d)`,
        line: { color: color, width: 1.3 },
        hoverinfo: 'text',
        text: hoverLS
      });

      // Peak marker
      const peakX = isPeriod ? pg.peak_period : pg.peak_freq;
      traces.push({
        x: [peakX],
        y: [isLog ? Math.max(1e-4, pg.peak_power) : pg.peak_power],
        type: 'scatter',
        mode: 'markers',
        name: `${pg.label} Peak`,
        marker: { color: color, size: 7, symbol: 'star' },
        hoverinfo: 'text',
        text: [`Peak: P = ${pg.peak_period.toFixed(2)} d (Power = ${pg.peak_power.toFixed(3)})`],
        showlegend: false
      });
    });

    // Analytical FAP lines from the primary indicator
    const firstPg = pgDict[keysToPlot[0]];
    shapes.push(
      { type: 'line', xref: 'paper', x0: 0, x1: 1, y0: firstPg.fap01, y1: firstPg.fap01, line: { color: '#FF2D55', width: 1.0, dash: 'dash' } },
      { type: 'line', xref: 'paper', x0: 0, x1: 1, y0: firstPg.fap1,  y1: firstPg.fap1,  line: { color: '#00E676', width: 1.0, dash: 'dash' } },
      { type: 'line', xref: 'paper', x0: 0, x1: 1, y0: firstPg.fap5,  y1: firstPg.fap5,  line: { color: '#AF52DE', width: 1.0, dash: 'dash' } }
    );

    // Rotation Harmonics
    for (let h = 1; h <= 4; h++) {
      const fh = h * f_rot;
      const xh = isPeriod ? (1.0 / fh) : fh;
      shapes.push({
        type: 'line', xref: 'x', yref: 'paper',
        x0: xh, x1: xh, y0: 0, y1: 1,
        line: { color: th.harmonicLine, width: 0.9, dash: 'dashdot' }
      });
    }

    // Custom Guide Lines in overlay
    if (state.customGuidelines && state.customGuidelines.length > 0) {
      state.customGuidelines.forEach(gl => {
        if (!gl.active) return;
        const xPos = isPeriod ? gl.period : gl.freq;
        shapes.push({
          type: 'line', xref: 'x', yref: 'paper',
          x0: xPos, x1: xPos, y0: 0, y1: 1,
          line: { color: gl.color || '#FF9500', width: 1.3, dash: 'dash' }
        });
      });
    }

    const f_start = Math.max(1e-4, parseFloat(el.tsFminInput ? el.tsFminInput.value : state.tsFmin) || 0.0);
    const f_stop = parseFloat(el.tsFmaxInput ? el.tsFmaxInput.value : state.tsFmax) || 0.15;
    const xAxisRange = isPeriod
      ? [Math.max(1.0 / f_stop, 2.0), Math.min(250.0, 1.0 / f_start)]
      : [Math.max(0.0, f_start), f_stop];

    const layout = {
      paper_bgcolor: th.paperBg,
      plot_bgcolor: th.plotBg,
      margin: { l: 55, r: 25, t: 25, bottom: 45 },
      xaxis: {
        title: { text: isPeriod ? 'Period (days)' : 'Frequency f (d⁻¹)', font: { color: th.titleColor, size: 11 } },
        tickfont: { color: th.tickColor, size: 10 },
        gridcolor: th.gridColor,
        showline: true,
        linecolor: th.axisLineColor,
        linewidth: 1.2,
        mirror: true,
        range: xAxisRange,
        autorange: false
      },
      yaxis: {
        title: { text: isLog ? 'LS Power [log]' : 'Normalized LS Power', font: { color: th.titleColor, size: 11 } },
        type: isLog ? 'log' : 'linear',
        tickfont: { color: th.tickColor, size: 10 },
        gridcolor: th.gridColor,
        showline: true,
        linecolor: th.axisLineColor,
        linewidth: 1.2,
        mirror: true
      },
      shapes: shapes,
      legend: {
        font: { color: th.legendText, size: 10 },
        bgcolor: th.legendBg,
        orientation: 'h',
        x: 0.0,
        y: 1.14
      }
    };

    Plotly.react(el.plotLSSpectra, traces, layout, { responsive: true, displayModeBar: false });
  }
}

async function exportDiagPNG() {
  if (!state.diagnosticsData) {
    showToast('Compute time series diagnostics first.');
    return;
  }
  showToast('Rendering Time Series Diagnostics publication PNG (300 DPI)...');
  try {
    const payload = {
      primary_key: state.selectedIndicators[0] || 'RV',
      secondary_keys: state.selectedIndicators.slice(1),
      use_period: state.lsDomain === 'period',
      y_log: state.lsScale === 'log'
    };
    const res = await fetch('/api/export_diag_png', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.status === 'ok') {
      window.open(data.url, '_blank');
      showToast(`Exported: ${data.filename}`);
    } else {
      showToast('Export error: ' + data.message);
    }
  } catch (err) {
    console.error('Export error:', err);
    showToast('Failed to export diagnostics PNG.');
  }
}

// -----------------------------------------------------------------------------
// VIEW 2: 1D WELCH PSD & BIVARIATE COHERENCE
// -----------------------------------------------------------------------------
async function autocalculateSegments() {
  showToast('Autocalculating adaptive campaign segments...');
  try {
    const payload = {
      dataset: state.currentDataset,
      series1: state.welchSeries1,
      preset: state.preset,
      k_segments: state.welchK,
      gap_threshold: 30.0,
      overlap: 0.5
    };
    const res = await fetch('/api/segmentation_suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.status === 'ok') {
      state.customSegments = null;
      showToast(`Autocalculated K=${data.k_segs} segments (N_eff=${data.neff.toFixed(1)}).`);
      await computeWelch1D();
    } else {
      showToast('Segmentation error: ' + data.message);
    }
  } catch (err) {
    console.error('Segmentation error:', err);
    showToast('Failed to autocalculate segments.');
  }
}

async function computeWelch1D() {
  showToast('Computing 1D Welch PSD & Bivariate Coherence...');
  ensureDistinct1DSeries();
  try {
    const payload = {
      dataset: state.currentDataset,
      series1: state.welchSeries1,
      series2: state.welchSeries2,
      preset: state.preset,
      seg_mode: state.welchSegMode,
      k_segments: state.welchK,
      custom_segments: state.customSegments,
      overlap: 0.5,
      taper: state.welchTaper,
      fmax: 0.15
    };
    const res = await fetch('/api/welch_1d', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.status === 'ok') {
      state.welch1DData = data.welch_1d;
      const w = data.welch_1d;

      // Update top header chips
      el.statN.textContent = w.n_pts.toLocaleString();
      el.statK.textContent = w.k_segs;
      el.statNeff.textContent = w.neff.toFixed(1);
      el.stat2R.textContent = `${w.two_r.toFixed(4)} d⁻¹`;
      el.statProt.textContent = `${w.p_rot.toFixed(2)} d`;

      if (el.segmentStatsBar) {
        el.segmentStatsBar.innerHTML = `
          <span><strong>Series:</strong> ${w.series1_label} × ${w.series2_label}</span>
          <span><strong>Segments (K):</strong> ${w.k_segs} (100% data kept)</span>
          <span><strong>N_eff:</strong> ${w.neff.toFixed(2)}</span>
          <span><strong>Mean T_seg:</strong> ${w.t_seg_mean.toFixed(1)} d</span>
          <span><strong>Ramirez Delgado 2ℛ:</strong> ${w.two_r.toFixed(5)} d⁻¹</span>
        `;
      }

      renderSegmentTimeline();
      renderSegmentBoundsEditor();
      renderWelchPSDPlot();
      renderWelch1DCohPlot();
      updateDualTab2Badge();
      showToast('1D Welch analysis computed.');
    } else {
      showToast('1D Welch error: ' + data.message);
    }
  } catch (err) {
    console.error('1D Welch error:', err);
    showToast('Failed to compute 1D Welch analysis.');
  }
}

function renderSegmentTimeline() {
  if (!state.welch1DData || !el.plotSegmentTimeline) return;
  const w = state.welch1DData;
  const th = getThemeColors();
  const t = w.time;
  const s1 = w.s1;
  const segs = w.segments;

  // Scatter plot of observations
  const traceData = {
    x: t,
    y: s1,
    type: 'scatter',
    mode: 'markers',
    name: `${w.series1_label} Observations`,
    marker: { color: th.isLight ? '#1E293B' : '#000000', size: 4.5, opacity: 0.65 },
    hoverinfo: 'text',
    text: t.map((timeVal, idx) => `Time: ${timeVal.toFixed(2)} BJD<br>${w.series1_label}: ${s1[idx].toFixed(2)}`)
  };

  const shapes = [];
  const annotations = [];
  const yVals = s1.filter(v => !isNaN(v));
  const yMin = Math.min(...yVals);
  const yMax = Math.max(...yVals);
  const yMargin = (yMax - yMin) * 0.15 || 1.0;

  segs.forEach((s, idx) => {
    shapes.push({
      type: 'rect',
      xref: 'x',
      yref: 'y',
      x0: s.t_start,
      x1: s.t_end,
      y0: yMin - yMargin,
      y1: yMax + yMargin,
      fillcolor: s.color,
      opacity: 0.25,
      line: { color: s.color, width: 1.2 }
    });

    const tMid = 0.5 * (s.t_start + s.t_end);
    const yPos = yMax - (0.05 + 0.10 * (idx % 2)) * (yMax - yMin);
    annotations.push({
      x: tMid,
      y: yPos,
      text: `<b>Seg ${s.seg_id} (N=${s.n_pts})</b>`,
      showarrow: false,
      font: { color: s.color, size: 10.5 }
    });
  });

  const layout = {
    paper_bgcolor: th.paperBg,
    plot_bgcolor: th.plotBg,
    margin: { l: 55, r: 25, t: 25, bottom: 45 },
    xaxis: {
      title: { text: 'Time (BJD)', font: { color: th.titleColor, size: 11 } },
      tickfont: { color: th.tickColor, size: 10 },
      gridcolor: th.gridColor,
      showline: true,
      linecolor: th.axisLineColor,
      linewidth: 1.2,
      mirror: true
    },
    yaxis: {
      title: { text: w.series1_label, font: { color: th.titleColor, size: 11 } },
      tickfont: { color: th.tickColor, size: 10 },
      gridcolor: th.gridColor,
      showline: true,
      linecolor: th.axisLineColor,
      linewidth: 1.2,
      mirror: true,
      range: [yMin - yMargin, yMax + yMargin]
    },
    shapes: shapes,
    annotations: annotations,
    showlegend: false
  };

  Plotly.react(el.plotSegmentTimeline, [traceData], layout, { responsive: true, displayModeBar: false });
}

function renderSegmentBoundsEditor() {
  if (!state.welch1DData || !el.segmentBoundsTable) return;
  const segs = state.welch1DData.segments;
  el.segmentBoundsTable.innerHTML = '';

  segs.forEach((s) => {
    const card = document.createElement('div');
    card.className = 'segment-bound-card';

    card.innerHTML = `
      <div class="seg-badge-row">
        <span class="seg-color-badge" style="color: ${s.color};">
          <span class="seg-color-dot" style="background: ${s.color};"></span>
          Segment ${s.seg_id}
        </span>
        <span class="seg-pts-count">N = ${s.n_pts} pts</span>
      </div>
      <div class="seg-inputs-row">
        <span>Start:</span>
        <input type="number" class="seg-input-bound" data-seg="${s.seg_id}" data-bound="start" value="${s.start_idx}" step="1" min="0">
        <span>End:</span>
        <input type="number" class="seg-input-bound" data-seg="${s.seg_id}" data-bound="end" value="${s.end_idx}" step="1" min="1">
      </div>
    `;
    el.segmentBoundsTable.appendChild(card);
  });
}

function applyCustomSegmentBounds() {
  if (!el.segmentBoundsTable) return;
  const rows = el.segmentBoundsTable.querySelectorAll('.segment-bound-card');
  const custom = [];
  rows.forEach((card) => {
    const stInput = card.querySelector('[data-bound="start"]');
    const edInput = card.querySelector('[data-bound="end"]');
    const st = parseInt(stInput.value);
    const ed = parseInt(edInput.value);
    if (!isNaN(st) && !isNaN(ed) && ed > st) {
      custom.push([st, ed]);
    }
  });

  if (custom.length > 0) {
    state.customSegments = custom;
    state.welchK = custom.length;
    if (el.welchKInput) el.welchKInput.value = custom.length;
    showToast(`Applied ${custom.length} custom segment bounds.`);
    computeWelch1D();
  }
}

function renderWelchPSDPlot() {
  if (!state.welch1DData || !el.plotWelchPSD) return;
  const w = state.welch1DData;
  const th = getThemeColors();
  const isPeriod = state.welchPsdDomain === 'period';
  const isNorm = (state.welchPsdNorm !== 'raw');
  const xVals = isPeriod ? w.period_grid : w.f_grid;
  const traces = [];

  const yLS1 = isNorm ? (w.norm_ls1 || w.ls_norm1 || w.ls_psd1) : w.ls_psd1;
  const yW1 = isNorm ? (w.norm_psd1 || w.psd1) : w.psd1;
  const yLS2 = isNorm ? (w.norm_ls2 || w.ls_norm2 || w.ls_psd2) : w.ls_psd2;
  const yW2 = isNorm ? (w.norm_psd2 || w.psd2) : w.psd2;

  // Build tooltips with Period, Frequency, and Power
  const hoverLS1 = w.f_grid.map((f, i) => {
    const p_str = f > 0 ? (1.0 / f).toFixed(2) : '∞';
    const val = yLS1[i];
    return `Period: ${p_str} d<br>Frequency: ${f.toFixed(4)} d⁻¹<br>LS (${w.series1_label}): ${isNorm ? val.toFixed(4) : val.toExponential(3)}`;
  });
  const hoverWelch1 = w.f_grid.map((f, i) => {
    const p_str = f > 0 ? (1.0 / f).toFixed(2) : '∞';
    const val = yW1[i];
    return `Period: ${p_str} d<br>Frequency: ${f.toFixed(4)} d⁻¹<br>Welch PSD (${w.series1_label}): ${isNorm ? val.toFixed(4) : val.toExponential(3)}`;
  });
  const hoverLS2 = w.f_grid.map((f, i) => {
    const p_str = f > 0 ? (1.0 / f).toFixed(2) : '∞';
    const val = yLS2[i];
    return `Period: ${p_str} d<br>Frequency: ${f.toFixed(4)} d⁻¹<br>LS (${w.series2_label}): ${isNorm ? val.toFixed(4) : val.toExponential(3)}`;
  });
  const hoverWelch2 = w.f_grid.map((f, i) => {
    const p_str = f > 0 ? (1.0 / f).toFixed(2) : '∞';
    const val = yW2[i];
    return `Period: ${p_str} d<br>Frequency: ${f.toFixed(4)} d⁻¹<br>Welch PSD (${w.series2_label}): ${isNorm ? val.toFixed(4) : val.toExponential(3)}`;
  });

  if (state.welchCurves.ls1) {
    traces.push({
      x: xVals,
      y: yLS1.map(v => Math.max(1e-5, v)),
      type: 'scatter',
      mode: 'lines',
      name: `Lomb-Scargle (${w.series1_label})`,
      line: { color: th.isLight ? '#475569' : '#94A3B8', width: 1.2 },
      hoverinfo: 'text',
      text: hoverLS1
    });
  }

  if (state.welchCurves.welch1) {
    traces.push({
      x: xVals,
      y: yW1.map(v => Math.max(1e-5, v)),
      type: 'scatter',
      mode: 'lines',
      name: `Welch PSD (${w.series1_label})`,
      line: { color: th.isLight ? '#0284C7' : '#00E5FF', width: 1.8 },
      hoverinfo: 'text',
      text: hoverWelch1
    });
  }

  if (state.welchCurves.ls2) {
    traces.push({
      x: xVals,
      y: yLS2.map(v => Math.max(1e-5, v)),
      type: 'scatter',
      mode: 'lines',
      name: `Lomb-Scargle (${w.series2_label})`,
      line: { color: th.isLight ? '#64748B' : '#CBD5E1', width: 1.2 },
      hoverinfo: 'text',
      text: hoverLS2
    });
  }

  if (state.welchCurves.welch2) {
    traces.push({
      x: xVals,
      y: yW2.map(v => Math.max(1e-5, v)),
      type: 'scatter',
      mode: 'lines',
      name: `Welch PSD (${w.series2_label})`,
      line: { color: '#FF2D55', width: 1.8 },
      hoverinfo: 'text',
      text: hoverWelch2
    });
  }

  const shapes = [];
  w.harmonics.forEach(h => {
    const xh = isPeriod ? h.p_center : h.f_center;
    shapes.push({
      type: 'line', xref: 'x', yref: 'paper',
      x0: xh, x1: xh, y0: 0, y1: 1,
      line: { color: th.harmonicLine, width: 0.9, dash: 'dashdot' }
    });
    if (!isPeriod) {
      shapes.push({
        type: 'rect', xref: 'x', yref: 'paper',
        x0: h.f_low, x1: h.f_high, y0: 0, y1: 1,
        fillcolor: th.harmonicBand, line: { width: 0 }
      });
    }
  });

  // Custom Guide Lines
  if (state.customGuidelines && state.customGuidelines.length > 0) {
    state.customGuidelines.forEach(gl => {
      if (!gl.active) return;
      const xPos = isPeriod ? gl.period : gl.freq;
      shapes.push({
        type: 'line', xref: 'x', yref: 'paper',
        x0: xPos, x1: xPos, y0: 0, y1: 1,
        line: { color: gl.color || '#FF9500', width: 1.4, dash: 'dash' }
      });
    });
  }

  const layout = {
    paper_bgcolor: th.paperBg,
    plot_bgcolor: th.plotBg,
    margin: { l: 55, r: 25, t: 25, bottom: 45 },
    xaxis: {
      title: { text: isPeriod ? 'Period (days)' : 'Frequency f (d⁻¹)', font: { color: th.titleColor, size: 11 } },
      tickfont: { color: th.tickColor, size: 10 },
      gridcolor: th.gridColor,
      showline: true,
      linecolor: th.axisLineColor,
      linewidth: 1.2,
      mirror: true
    },
    yaxis: {
      title: { text: isNorm ? 'Normalized Power [P / P_max, log scale]' : 'PSD Ŝ(f) [Parseval, log scale]', font: { color: th.titleColor, size: 11 } },
      type: 'log',
      tickfont: { color: th.tickColor, size: 10 },
      gridcolor: th.gridColor,
      showline: true,
      linecolor: th.axisLineColor,
      linewidth: 1.2,
      mirror: true
    },
    shapes: shapes,
    legend: {
      font: { color: th.legendText, size: 10 },
      bgcolor: th.legendBg,
      bordercolor: th.legendBorder,
      borderwidth: 1,
      orientation: 'h',
      x: 0.0,
      y: 1.14
    }
  };

  // Prevent auto-adjust from dropping down to power of approx 0 near DC edge bins
  let validPowers = [];
  traces.forEach(tr => {
    if (tr.y && tr.y.length > 5) {
      // slice(4) ignores the first 4 bins near DC / zero
      const vals = tr.y.slice(4).filter(v => typeof v === 'number' && v > 0 && isFinite(v));
      validPowers.push(...vals);
    }
  });

  if (isNorm) {
    layout.yaxis.range = [Math.log10(1e-4), Math.log10(1.8)];
  } else if (validPowers.length > 0) {
    validPowers.sort((a, b) => a - b);
    const pMax = validPowers[validPowers.length - 1];
    const p5 = validPowers[Math.floor(validPowers.length * 0.05)];
    const pMin = Math.max(pMax * 1e-4, p5, 1e-5);
    layout.yaxis.range = [Math.log10(pMin * 0.5), Math.log10(pMax * 2.0)];
  }

  Plotly.react(el.plotWelchPSD, traces, layout, { responsive: true, displayModeBar: false });
}

function renderWelch1DCohPlot() {
  if (!state.welch1DData || !el.plotWelch1DCoh) return;
  const w = state.welch1DData;
  const th = getThemeColors();
  const isPeriod = state.welchCohDomain === 'period';
  const isLog = state.welchCohScale === 'log';
  const xVals = isPeriod ? w.period_grid : w.f_grid;
  const yVals = isLog ? w.z_fisher.map(v => Math.max(0.1, v)) : w.z_fisher;

  const hoverCoh = w.f_grid.map((f, i) => {
    const p_str = f > 0 ? (1.0 / f).toFixed(2) : '∞';
    return `Period: ${p_str} d<br>Frequency: ${f.toFixed(4)} d⁻¹<br>Fisher z(f): ${w.z_fisher[i].toFixed(3)}<br>γ²: ${w.coherence[i].toFixed(3)}`;
  });

  const traceCoh = {
    x: xVals,
    y: yVals,
    type: 'scatter',
    mode: 'lines',
    name: 'z(f) Coherence',
    line: { color: th.isLight ? '#0284C7' : '#00E5FF', width: 2.0 },
    hoverinfo: 'text',
    text: hoverCoh
  };

  // Dominant Peak marker
  const peakX = isPeriod ? w.peak_p : w.peak_f;
  const tracePeak = {
    x: [peakX],
    y: [isLog ? Math.max(0.1, w.peak_z) : w.peak_z],
    type: 'scatter',
    mode: 'markers',
    name: `Peak: P = ${w.peak_p.toFixed(2)} d (z = ${w.peak_z.toFixed(2)})`,
    marker: { color: '#FF9100', size: 8, symbol: 'star' },
    hoverinfo: 'text',
    text: [`Peak: P = ${w.peak_p.toFixed(2)} d (z = ${w.peak_z.toFixed(2)})`]
  };

  const shapes = [];
  // Analytical FAP lines (workspace rules: 0.1% crimson, 1% springgreen, 5% darkorchid)
  shapes.push(
    { type: 'line', xref: 'paper', x0: 0, x1: 1, y0: w.fap01, y1: w.fap01, line: { color: '#FF2D55', width: 1.1, dash: 'dash' } },
    { type: 'line', xref: 'paper', x0: 0, x1: 1, y0: w.fap1,  y1: w.fap1,  line: { color: '#00E676', width: 1.1, dash: 'dash' } },
    { type: 'line', xref: 'paper', x0: 0, x1: 1, y0: w.fap5,  y1: w.fap5,  line: { color: '#AF52DE', width: 1.1, dash: 'dash' } }
  );

  // Rotation Harmonics with Ramirez Delgado 2R shading
  w.harmonics.forEach(h => {
    const xh = isPeriod ? h.p_center : h.f_center;
    shapes.push({
      type: 'line', xref: 'x', yref: 'paper',
      x0: xh, x1: xh, y0: 0, y1: 1,
      line: { color: th.harmonicLine, width: 0.9, dash: 'dashdot' }
    });
    if (!isPeriod) {
      shapes.push({
        type: 'rect', xref: 'x', yref: 'paper',
        x0: h.f_low, x1: h.f_high, y0: 0, y1: 1,
        fillcolor: th.harmonicBand, line: { width: 0 }
      });
    }
  });

  // Custom Guide Lines
  if (state.customGuidelines && state.customGuidelines.length > 0) {
    state.customGuidelines.forEach(gl => {
      if (!gl.active) return;
      const xPos = isPeriod ? gl.period : gl.freq;
      shapes.push({
        type: 'line', xref: 'x', yref: 'paper',
        x0: xPos, x1: xPos, y0: 0, y1: 1,
        line: { color: gl.color || '#FF9500', width: 1.4, dash: 'dash' }
      });
    });
  }

  const layout = {
    paper_bgcolor: th.paperBg,
    plot_bgcolor: th.plotBg,
    margin: { l: 55, r: 25, t: 25, bottom: 45 },
    xaxis: {
      title: { text: isPeriod ? 'Period (days)' : 'Frequency f (d⁻¹)', font: { color: th.titleColor, size: 11 } },
      tickfont: { color: th.tickColor, size: 10 },
      gridcolor: th.gridColor,
      showline: true,
      linecolor: th.axisLineColor,
      linewidth: 1.2,
      mirror: true
    },
    yaxis: {
      title: { text: isLog ? 'z(f) [log scale]' : 'z(f)', font: { color: th.titleColor, size: 11 } },
      type: isLog ? 'log' : 'linear',
      tickfont: { color: th.tickColor, size: 10 },
      gridcolor: th.gridColor,
      showline: true,
      linecolor: th.axisLineColor,
      linewidth: 1.2,
      mirror: true
    },
    shapes: shapes,
    legend: {
      font: { color: th.legendText, size: 10 },
      bgcolor: th.legendBg,
      bordercolor: th.legendBorder,
      borderwidth: 1,
      orientation: 'h',
      x: 0.0,
      y: 1.12
    }
  };

  Plotly.react(el.plotWelch1DCoh, [traceCoh, tracePeak], layout, { responsive: true, displayModeBar: false });
}

async function exportWelch1DPNG() {
  if (!state.welch1DData) {
    showToast('Compute 1D Welch coherence first.');
    return;
  }
  showToast('Rendering 1D Welch Publication PNG (300 DPI)...');
  try {
    const payload = {
      use_period: state.welchCohDomain === 'period',
      y_log: state.welchCohScale === 'log'
    };
    const res = await fetch('/api/export_welch1d_png', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.status === 'ok') {
      window.open(data.url, '_blank');
      showToast(`Exported: ${data.filename}`);
    } else {
      showToast('Export error: ' + data.message);
    }
  } catch (err) {
    console.error('Export error:', err);
    showToast('Failed to export 1D coherence PNG.');
  }
}

// -----------------------------------------------------------------------------
// SIGNAL GUIDE LINES FOR 1D SPECTRA & COHERENCE (VIEW 1 & VIEW 2)
// -----------------------------------------------------------------------------
function renderGuidelinesList() {
  if (!el.guidelinesList) return;
  el.guidelinesList.innerHTML = '';
  if (!state.customGuidelines || state.customGuidelines.length === 0) {
    return;
  }
  state.customGuidelines.forEach((gl) => {
    const chip = document.createElement('div');
    chip.className = 'guideline-chip' + (gl.active ? ' active' : ' disabled');
    chip.style.cssText = `display: inline-flex; align-items: center; gap: 6px; padding: 3px 8px; border-radius: 12px; font-size: 11px; background: ${gl.active ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.02)'}; border: 1px solid ${gl.color}; color: var(--text-main); cursor: pointer; user-select: none;`;
    
    chip.innerHTML = `
      <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${gl.color}; opacity: ${gl.active ? '1.0' : '0.4'};"></span>
      <span style="opacity: ${gl.active ? '1.0' : '0.5'};">${gl.label}</span>
      <button type="button" class="btn-remove-guideline" data-id="${gl.id}" style="background: none; border: none; color: var(--text-muted); font-size: 13px; line-height: 1; cursor: pointer; padding: 0 0 0 2px;" title="Remove Guide Line">&times;</button>
    `;

    chip.addEventListener('click', (e) => {
      if (e.target.classList.contains('btn-remove-guideline') || e.target.closest('.btn-remove-guideline')) {
        e.stopPropagation();
        removeCustomGuideline(gl.id);
        return;
      }
      toggleCustomGuideline(gl.id);
    });

    el.guidelinesList.appendChild(chip);
  });
}

function addCustomGuideline() {
  if (!el.inputGuidelineVal) return;
  const rawVal = parseFloat(el.inputGuidelineVal.value);
  if (isNaN(rawVal) || rawVal <= 0) {
    showToast('Please enter a valid positive frequency or period.');
    return;
  }
  const unit = el.selectGuidelineUnit ? el.selectGuidelineUnit.value : 'freq';
  let freq = 0;
  let period = 0;
  if (unit === 'period') {
    period = rawVal;
    freq = 1.0 / rawVal;
  } else {
    freq = rawVal;
    period = 1.0 / rawVal;
  }

  const userLabel = el.inputGuidelineLabel ? el.inputGuidelineLabel.value.trim() : '';
  const label = userLabel ? `${userLabel} (${period.toFixed(1)}d)` : `${freq.toFixed(4)} d⁻¹ (${period.toFixed(1)}d)`;
  const color = el.inputGuidelineColor ? el.inputGuidelineColor.value : '#FF9500';

  const newGl = {
    id: `gl_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    freq: freq,
    period: period,
    label: label,
    color: color,
    active: true
  };

  state.customGuidelines.push(newGl);
  el.inputGuidelineVal.value = '';
  if (el.inputGuidelineLabel) el.inputGuidelineLabel.value = '';

  renderGuidelinesList();
  renderWelchPSDPlot();
  renderWelch1DCohPlot();
  renderLSSpectraPlot();
  showToast(`Added guide line at ${freq.toFixed(4)} d⁻¹ (${period.toFixed(1)} d).`);
}

function removeCustomGuideline(id) {
  state.customGuidelines = state.customGuidelines.filter(g => g.id !== id);
  renderGuidelinesList();
  renderWelchPSDPlot();
  renderWelch1DCohPlot();
  renderLSSpectraPlot();
  showToast('Removed guide line.');
}

function toggleCustomGuideline(id) {
  const gl = state.customGuidelines.find(g => g.id === id);
  if (gl) {
    gl.active = !gl.active;
    renderGuidelinesList();
    renderWelchPSDPlot();
    renderWelch1DCohPlot();
    renderLSSpectraPlot();
  }
}

// -----------------------------------------------------------------------------
// VIEW 3: 2D DUAL-FREQUENCY COHERENCE MATRIX & SLICE CONTROLS
// -----------------------------------------------------------------------------
function initDefaultHorizontalCuts(p_rot) {
  const f_rot = 1.0 / p_rot;
  state.horizontalCuts = [
    { id: 'f_rot', f2: f_rot, p2: p_rot, label: `Fundamental f_rot (${p_rot.toFixed(1)} d)`, color: '#00E5FF', is_default: true, active: true },
    { id: '2f_rot', f2: 2.0 * f_rot, p2: p_rot / 2.0, label: `Harmonic 2f_rot (${(p_rot / 2.0).toFixed(1)} d)`, color: '#FF2D55', is_default: true, active: true }
  ];
  if (!state.selectedHorizCutId) {
    state.selectedHorizCutId = 'f_rot';
  }
  renderHorizontalCutsList();
}

function updateSingleHorizCutSelect() {
  if (!el.selectSingleHorizCut) return;
  el.selectSingleHorizCut.innerHTML = '';
  const cuts = state.horizontalCuts || [];
  cuts.forEach(cut => {
    const opt = document.createElement('option');
    opt.value = cut.id;
    opt.textContent = cut.label;
    if (cut.id === state.selectedHorizCutId) opt.selected = true;
    el.selectSingleHorizCut.appendChild(opt);
  });
  if (cuts.length > 0 && (!state.selectedHorizCutId || !cuts.some(c => c.id === state.selectedHorizCutId))) {
    state.selectedHorizCutId = cuts[0].id;
    el.selectSingleHorizCut.value = cuts[0].id;
  }
}

function renderHorizontalCutsList() {
  if (!el.horizontalCutsList) return;
  el.horizontalCutsList.innerHTML = '';
  updateSingleHorizCutSelect();
  if (!state.horizontalCuts || state.horizontalCuts.length === 0) {
    el.horizontalCutsList.innerHTML = '<span style="font-size: 11px; color: var(--text-muted); padding: 4px;">No active cuts configured.</span>';
    return;
  }
  state.horizontalCuts.forEach((cut) => {
    const isSelected = (state.horizLayout === 'single' && cut.id === state.selectedHorizCutId);
    const item = document.createElement('div');
    item.className = 'cut-chip' + (cut.active ? ' active' : ' disabled') + (isSelected ? ' selected' : '');
    item.title = `Click to inspect coupled slice at f₂ = ${cut.f2.toFixed(4)} d⁻¹ (P₂ = ${cut.p2.toFixed(1)} d)`;

    item.innerHTML = `
      <div class="cut-chip-main">
        <span class="cut-color-indicator" style="background-color: ${cut.color}; color: ${cut.color};"></span>
        <div class="cut-chip-details">
          <div class="cut-chip-title" style="font-size: 11.5px; font-weight: 600;">${cut.label}</div>
          <div class="cut-chip-sub" style="font-size: 10px; color: var(--text-muted);">f₂ = ${cut.f2.toFixed(5)} d⁻¹</div>
        </div>
      </div>
      <div class="cut-chip-actions">
        ${cut.is_default ? '<span class="cut-default-badge">default</span>' : `<button type="button" class="btn-remove-cut" title="Remove Cut" data-id="${cut.id}">&times;</button>`}
      </div>
    `;

    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('btn-remove-cut')) {
        removeHorizontalCut(cut.id);
        return;
      }
      state.selectedHorizCutId = cut.id;
      if (el.selectSingleHorizCut) el.selectSingleHorizCut.value = cut.id;
      renderHorizontalCutsList();
      updateActiveSlice(state.activeF1 || cut.f2, cut.f2);
      renderHorizontalCut();
    });

    el.horizontalCutsList.appendChild(item);
  });
}

function addCustomHorizontalCut() {
  if (!el.inputCustomCutFreq) return;
  const rawVal = parseFloat(el.inputCustomCutFreq.value);
  if (isNaN(rawVal) || rawVal <= 0) {
    showToast('Please enter a positive frequency or period.');
    return;
  }
  const unit = el.selectCustomCutUnit ? el.selectCustomCutUnit.value : 'freq';
  let f2_val = 0;
  let p2_val = 0;
  if (unit === 'period') {
    p2_val = rawVal;
    f2_val = 1.0 / rawVal;
  } else {
    f2_val = rawVal;
    p2_val = 1.0 / rawVal;
  }
  
  if (state.horizontalCuts.some(c => Math.abs(c.f2 - f2_val) < 1e-5)) {
    showToast('A cut at this frequency already exists.');
    return;
  }
  
  const palette = ['#FF9500', '#AF52DE', '#30D158', '#FFCC00', '#5E5CE6', '#00E5FF', '#FF2D55'];
  const assignedColor = palette[state.horizontalCuts.length % palette.length];
  const cutId = `cut_custom_${Date.now()}`;
  const label = `${p2_val.toFixed(1)} d (${f2_val.toFixed(4)} d⁻¹)`;
  
  state.horizontalCuts.push({
    id: cutId,
    f2: f2_val,
    p2: p2_val,
    label: label,
    color: assignedColor,
    is_default: false,
    active: true
  });
  state.selectedHorizCutId = cutId;
  
  el.inputCustomCutFreq.value = '';
  renderHorizontalCutsList();
  showToast(`Added horizontal cut at f₂ = ${f2_val.toFixed(4)} d⁻¹.`);
  triggerMultiTargetSlice();
}

function removeHorizontalCut(id) {
  state.horizontalCuts = state.horizontalCuts.filter(c => c.id !== id);
  if (state.selectedHorizCutId === id && state.horizontalCuts.length > 0) {
    state.selectedHorizCutId = state.horizontalCuts[0].id;
  }
  renderHorizontalCutsList();
  showToast('Removed horizontal cut.');
  triggerMultiTargetSlice();
}

async function triggerMultiTargetSlice() {
  if (!state.coherenceData) return;
  const f1_sel = state.activeF1 || (1.0 / state.coherenceData.p_rot);
  const f2_sel = state.activeF2 || (1.0 / state.coherenceData.p_rot);
  
  const targets = (state.horizontalCuts || []).map(c => ({
    id: c.id,
    f2: c.f2,
    label: c.label,
    color: c.color,
    is_default: c.is_default
  }));
  
  try {
    const res = await fetch('/api/slice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        f1: f1_sel,
        f2: f2_sel,
        horizontal_targets: targets
      })
    });
    const data = await res.json();
    if (data.status === 'ok') {
      state.slicesData = data.slices;
      if (data.slices && data.slices.detected_peaks) {
        state.detectedPeaks = data.slices.detected_peaks;
        renderPeakDetectorTable(state.detectedPeaks);
      }
      renderHorizontalCut();
      renderAntiDiagonalCut();
      updateMatrixShapes();
      renderHorizontalCutsList();
      updateMetricsCard(data.slices.metrics);
    }
  } catch (err) {
    console.error('Multi-target slice error:', err);
  }
}

function renderPeakDetectorTable(peaks) {
  if (!el.peakDetectorTbody) return;
  el.peakDetectorTbody.innerHTML = '';
  
  if (!peaks || peaks.length === 0) {
    el.peakDetectorTbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 14px;">No significant peaks detected under the current threshold filter.</td></tr>';
    return;
  }
  
  peaks.forEach((pk) => {
    const tr = document.createElement('tr');
    
    const isFap01 = pk.sig_tier === 1 || String(pk.sig).includes('0.1');
    const isFap1 = pk.sig_tier === 2 || String(pk.sig).includes('1.0') || String(pk.sig).includes('1%');
    const sigClass = isFap01 ? 'sig-high' : (isFap1 ? 'sig-med' : 'sig-low');
    const sigLabel = isFap01 ? '≥ 0.1% FAP' : (isFap1 ? '≥ 1.0% FAP' : '≥ 5.0% FAP');
    
    let tagClass = 'tag-harmonic';
    const cls = pk.classification || '';
    if (cls.includes('Annual') || cls.includes('1-Yr')) tagClass = 'tag-annual';
    else if (cls.includes('Solar') || cls.includes('6-Mon')) tagClass = 'tag-semiannual';
    else if (cls.includes('Lunar') || cls.includes('1-Mon')) tagClass = 'tag-lunar';
    else if (cls.includes('Diagonal')) tagClass = 'tag-diagonal';

    const pBeatStr = (pk.p_beat && pk.p_beat < 1e5) ? `${pk.p_beat.toFixed(1)} d` : '∞ (Diagonal)';

    tr.innerHTML = `
      <td><strong>${pk.f1.toFixed(4)}</strong>, <strong>${pk.f2.toFixed(4)}</strong></td>
      <td>${pk.p1.toFixed(1)} d, ${pk.p2.toFixed(1)} d</td>
      <td>${pk.delta_f.toFixed(4)} d⁻¹</td>
      <td>${pBeatStr}</td>
      <td><strong>${pk.z.toFixed(2)}</strong></td>
      <td><span class="m-badge ${sigClass}">${sigLabel}</span></td>
      <td><span class="alias-pill ${tagClass}">${cls}</span></td>
      <td>
        <button type="button" class="mini-btn-inspect" title="Inspect node cross-sections">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="2" x2="12" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line></svg>
          Inspect
        </button>
      </td>
    `;
    
    tr.querySelector('.mini-btn-inspect').addEventListener('click', () => {
      updateActiveSlice(pk.f1, pk.f2);
      showToast(`Inspecting node at (${pk.f1.toFixed(4)}, ${pk.f2.toFixed(4)} d⁻¹)...`);
    });
    
    el.peakDetectorTbody.appendChild(tr);
  });
}

async function rescanPeaks() {
  if (!state.coherenceData) {
    showToast('Compute a coherence matrix first.');
    return;
  }
  const minFap = el.peakFapFilter ? el.peakFapFilter.value : 'fap1';
  showToast(`Rescanning peaks with ${minFap} threshold...`);
  try {
    const res = await fetch('/api/detect_peaks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ min_fap: minFap, max_peaks: 60 })
    });
    const data = await res.json();
    if (data.status === 'ok') {
      state.detectedPeaks = data.peaks;
      renderPeakDetectorTable(data.peaks);
      showToast(`Detected ${data.peaks.length} significant peak nodes.`);
    } else {
      showToast(`Peak scan error: ${data.message}`);
    }
  } catch (err) {
    console.error('Peak scan error:', err);
    showToast('Failed to rescan peaks.');
  }
}

async function runComputation() {
  el.btnCompute.classList.add('loading');
  el.btnCompute.querySelector('.btn-text').textContent = 'Computing Matrix...';

  const fminVal = el.fminInput ? parseFloat(el.fminInput.value) : 0.0;
  const fmaxVal = el.fmaxInput ? parseFloat(el.fmaxInput.value) : 0.10;
  const lVal = (!isNaN(state.L_pts) && state.L_pts > 0) ? state.L_pts : (parseInt(el.lengthInput.value) || 200);

  let customSegs = null;
  if (state.dualSegSource === 'tab2') {
    if (state.welch1DData && state.welch1DData.segments && state.welch1DData.segments.length >= 2) {
      customSegs = state.welch1DData.segments;
    } else {
      try {
        const segRes = await fetch('/api/segmentation_suggest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dataset: state.currentDataset || 'harpsn',
            series1: state.series1 || 'RV',
            preset: state.preset || '10yr',
            min_pts: 75,
            fallback_min: 50,
            gap_threshold: 30.0,
            overlap: 0.5
          })
        });
        const segData = await segRes.json();
        if (segData.status === 'ok') {
          customSegs = segData.segments;
        }
      } catch (err) {
        console.warn('Could not autocalculate adaptive segments for dual coherence:', err);
      }
    }
  }

  const targetList = (state.horizontalCuts && state.horizontalCuts.length > 0) ? state.horizontalCuts.map(c => ({
    id: c.id,
    f2: c.f2,
    label: c.label,
    color: c.color,
    is_default: c.is_default
  })) : null;

  const payload = {
    dataset: state.currentDataset || 'harpsn',
    series1: state.series1 || 'RV',
    series2: state.series2 || 'FWHM',
    mode: state.mode || 'auto',
    preset: state.preset || '10yr',
    seg_source: state.dualSegSource,
    custom_segments: customSegs,
    L_pts: lVal,
    taper: state.taper || 'KaiserBessel',
    fmin: isNaN(fminVal) ? 0.0 : fminVal,
    fmax: isNaN(fmaxVal) ? 0.10 : fmaxVal,
    fap_type: state.fap_type || 'analytical',
    n_mc: (!isNaN(state.n_mc) && state.n_mc > 0) ? state.n_mc : 200,
    horizontal_targets: targetList
  };

  try {
    const res = await fetch('/api/compute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.status === 'ok') {
      state.coherenceData = data.coherence;
      state.slicesData = data.slices;
      
      const f_rot = 1.0 / data.coherence.p_rot;
      state.activeF1 = f_rot;
      state.activeF2 = f_rot;

      if (!state.horizontalCuts || state.horizontalCuts.length === 0) {
        initDefaultHorizontalCuts(data.coherence.p_rot);
      } else {
        renderHorizontalCutsList();
      }

      if (data.slices && data.slices.detected_peaks) {
        state.detectedPeaks = data.slices.detected_peaks;
        renderPeakDetectorTable(state.detectedPeaks);
      }

      const f_grid = data.coherence.f_grid;
      state.zoom = {
        isZoomed: false,
        f1_min: f_grid[0],
        f1_max: f_grid[f_grid.length - 1],
        f2_min: f_grid[0],
        f2_max: f_grid[f_grid.length - 1]
      };
      if (el.btnResetZoom) el.btnResetZoom.style.display = 'none';

      updateStatusHeader(data);
      updateLandingStats();
      renderMatrixPlot();
      renderHorizontalCut();
      renderAntiDiagonalCut();
      updateMetricsCard(data.slices.metrics);
      showToast('Coherence matrix computed successfully.');
    } else {
      showToast(`Error: ${data.message}`);
    }
  } catch (err) {
    console.error('Computation error:', err);
    showToast('Failed to compute coherence matrix.');
  } finally {
    el.btnCompute.classList.remove('loading');
    el.btnCompute.querySelector('.btn-text').textContent = 'Compute Coherence Matrix';
  }
}

async function updateActiveSlice(f1, f2) {
  state.activeF1 = f1;
  state.activeF2 = f2;

  const targets = (state.horizontalCuts || []).map(c => ({
    id: c.id,
    f2: c.f2,
    label: c.label,
    color: c.color,
    is_default: c.is_default
  }));

  try {
    const res = await fetch('/api/slice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ f1: f1, f2: f2, horizontal_targets: targets })
    });
    const data = await res.json();
    if (data.status === 'ok') {
      state.slicesData = data.slices;
      if (data.slices && data.slices.detected_peaks) {
        state.detectedPeaks = data.slices.detected_peaks;
        renderPeakDetectorTable(state.detectedPeaks);
      }
      renderHorizontalCut();
      renderAntiDiagonalCut();
      updateMatrixShapes();
      renderHorizontalCutsList();
      updateMetricsCard(data.slices.metrics);
    }
  } catch (err) {
    console.error('Slice extraction error:', err);
  }
}

function updateStatusHeader(data) {
  if (!data) return;
  const c = data.coherence;
  const ds = data.dataset_info;
  if (el.statN && ds && ds.n_pts !== undefined) {
    el.statN.textContent = ds.n_pts.toLocaleString();
  }
  if (el.statK && c) {
    const kVal = c.k_segments !== undefined ? c.k_segments : c.k_segs;
    el.statK.textContent = kVal !== undefined ? kVal : '—';
  }
  if (el.statNeff && c) {
    const neffVal = c.n_eff !== undefined ? c.n_eff : c.neff;
    el.statNeff.textContent = (typeof neffVal === 'number') ? neffVal.toFixed(1) : '—';
  }
  if (el.stat2R && c) {
    const bwVal = c.bw_2R !== undefined ? c.bw_2R : c.two_r;
    el.stat2R.textContent = (typeof bwVal === 'number') ? `${bwVal.toFixed(4)} d⁻¹` : '—';
  }
  if (el.statProt && c) {
    el.statProt.textContent = (typeof c.p_rot === 'number') ? `${c.p_rot.toFixed(2)} d` : '—';
  }
}

function updateMetricsCard(m) {
  if (!m) return;
  const f1 = m.f1 !== undefined ? m.f1 : m.f1_sel;
  const p1 = m.p1 !== undefined ? m.p1 : m.p1_sel;
  const f2 = m.f2 !== undefined ? m.f2 : m.f2_sel;
  const p2 = m.p2 !== undefined ? m.p2 : m.p2_sel;
  const z = m.z_measured !== undefined ? m.z_measured : m.z_at_sel;
  const two_r = m.two_r !== undefined ? m.two_r : m.bw_2R;
  const delta_f = m.delta_f !== undefined ? m.delta_f : (typeof f1 === 'number' && typeof f2 === 'number' ? Math.abs(f1 - f2) / 2.0 : 0.0);
  const f_mid = m.f_mid !== undefined ? m.f_mid : (m.carrier_freq !== undefined ? m.carrier_freq : (typeof f1 === 'number' && typeof f2 === 'number' ? (f1 + f2) / 2.0 : 0.0));
  const p_mid = m.p_mid !== undefined ? m.p_mid : (m.carrier_period !== undefined ? m.carrier_period : (f_mid > 0 ? 1.0 / f_mid : 999.0));
  const p_beat = m.p_beat !== undefined ? m.p_beat : m.beat_period;

  if (el.mP1 && typeof p1 === 'number') el.mP1.textContent = `${p1.toFixed(1)} d`;
  if (el.mF1 && typeof f1 === 'number') el.mF1.textContent = `f₁ = ${f1.toFixed(4)} d⁻¹`;
  if (el.mP2 && typeof p2 === 'number') el.mP2.textContent = `${p2.toFixed(1)} d`;
  if (el.mF2 && typeof f2 === 'number') el.mF2.textContent = `f₂ = ${f2.toFixed(4)} d⁻¹`;
  if (el.mZ && typeof z === 'number') el.mZ.textContent = z.toFixed(2);

  // Compute significance badge dynamically if needed
  let sigText = m.significance;
  if (!sigText && typeof z === 'number' && typeof m.fap01 === 'number') {
    if (z >= m.fap01) sigText = 'Significant (> 0.1% FAP)';
    else if (z >= m.fap1) sigText = 'Significant (> 1.0% FAP)';
    else if (z >= m.fap5) sigText = 'Marginal (> 5.0% FAP)';
    else sigText = 'Noise Floor';
  }
  if (el.mSigBadge && sigText) {
    el.mSigBadge.textContent = sigText;
    el.mSigBadge.className = 'm-badge ' + (
      sigText.includes('0.1%') ? 'sig-high' :
      sigText.includes('1.0%') ? 'sig-med' :
      sigText.includes('5.0%') ? 'sig-low' : 'sig-none'
    );
  }

  if (el.m2R && typeof two_r === 'number') el.m2R.textContent = `${two_r.toFixed(4)} d⁻¹`;
  if (el.m2RP && typeof two_r === 'number' && typeof p1 === 'number') {
    el.m2RP.textContent = `ΔP ~ ${(two_r * p1 * p1).toFixed(1)} d`;
  }
  if (el.mPmid && typeof p_mid === 'number') el.mPmid.textContent = `${p_mid.toFixed(1)} d`;
  if (el.mFmid && typeof f_mid === 'number') el.mFmid.textContent = `f_mid = ${f_mid.toFixed(4)} d⁻¹`;

  if (el.mPbeat) {
    el.mPbeat.textContent = (p_beat && p_beat < 1e5) ? `${p_beat.toFixed(1)} d` : '∞ (Diagonal)';
  }
  if (el.mDeltaF && typeof delta_f === 'number') el.mDeltaF.textContent = `Δf = ${delta_f.toFixed(4)} d⁻¹`;

  if (el.mFap01 && typeof m.fap01 === 'number') el.mFap01.textContent = `0.1%: ${m.fap01.toFixed(2)}`;
  if (el.mFap1 && typeof m.fap1 === 'number') el.mFap1.textContent = `1.0%: ${m.fap1.toFixed(2)}`;
  if (el.mFap5 && typeof m.fap5 === 'number') el.mFap5.textContent = `5.0%: ${m.fap5.toFixed(2)}`;
}

const MATPLOTLIB_COLORSCALES = {"inferno": [[0.0, "rgb(0,0,4)"], [0.0213, "rgb(12,8,38)"], [0.0426, "rgb(27,12,65)"], [0.0638, "rgb(41,11,85)"], [0.0851, "rgb(56,9,98)"], [0.1064, "rgb(69,10,105)"], [0.1277, "rgb(81,14,108)"], [0.1489, "rgb(92,18,110)"], [0.1702, "rgb(103,22,110)"], [0.1915, "rgb(113,25,110)"], [0.2128, "rgb(122,29,109)"], [0.234, "rgb(132,32,107)"], [0.2553, "rgb(141,35,105)"], [0.2766, "rgb(151,39,102)"], [0.2979, "rgb(159,42,99)"], [0.3191, "rgb(168,46,95)"], [0.3404, "rgb(176,49,91)"], [0.3617, "rgb(183,53,87)"], [0.383, "rgb(191,57,82)"], [0.4043, "rgb(198,61,77)"], [0.4255, "rgb(204,66,72)"], [0.4468, "rgb(211,71,67)"], [0.4681, "rgb(217,77,61)"], [0.4894, "rgb(223,83,55)"], [0.5106, "rgb(227,89,51)"], [0.5319, "rgb(232,96,45)"], [0.5532, "rgb(236,103,38)"], [0.5745, "rgb(239,110,33)"], [0.5957, "rgb(243,118,27)"], [0.617, "rgb(245,125,21)"], [0.6383, "rgb(247,132,16)"], [0.6596, "rgb(249,140,10)"], [0.6809, "rgb(250,148,7)"], [0.7021, "rgb(251,155,6)"], [0.7234, "rgb(252,165,10)"], [0.7447, "rgb(252,172,17)"], [0.766, "rgb(252,180,24)"], [0.7872, "rgb(251,188,33)"], [0.8085, "rgb(250,196,42)"], [0.8298, "rgb(249,203,53)"], [0.8511, "rgb(247,211,64)"], [0.8723, "rgb(245,219,76)"], [0.8936, "rgb(243,227,90)"], [0.9149, "rgb(242,234,105)"], [0.9362, "rgb(241,241,121)"], [0.9574, "rgb(243,246,138)"], [0.9787, "rgb(248,251,154)"], [1.0, "rgb(252,255,164)"]], "turbo": [[0.0, "rgb(48,18,59)"], [0.0213, "rgb(65,67,167)"], [0.0426, "rgb(70,97,214)"], [0.0638, "rgb(71,120,240)"], [0.0851, "rgb(69,140,253)"], [0.1064, "rgb(59,160,253)"], [0.1277, "rgb(47,178,244)"], [0.1489, "rgb(35,195,228)"], [0.1702, "rgb(26,210,210)"], [0.1915, "rgb(24,221,194)"], [0.2128, "rgb(28,230,180)"], [0.234, "rgb(39,238,164)"], [0.2553, "rgb(56,244,145)"], [0.2766, "rgb(78,249,125)"], [0.2979, "rgb(97,252,108)"], [0.3191, "rgb(121,254,89)"], [0.3404, "rgb(139,255,75)"], [0.3617, "rgb(156,254,64)"], [0.383, "rgb(169,251,57)"], [0.4043, "rgb(183,247,53)"], [0.4255, "rgb(195,241,52)"], [0.4468, "rgb(208,234,52)"], [0.4681, "rgb(219,226,54)"], [0.4894, "rgb(229,217,56)"], [0.5106, "rgb(236,209,58)"], [0.5319, "rgb(244,199,58)"], [0.5532, "rgb(249,188,57)"], [0.5745, "rgb(252,179,54)"], [0.5957, "rgb(254,167,50)"], [0.617, "rgb(254,155,45)"], [0.6383, "rgb(254,144,41)"], [0.6596, "rgb(251,129,34)"], [0.6809, "rgb(249,117,29)"], [0.7021, "rgb(245,105,24)"], [0.7234, "rgb(240,91,18)"], [0.7447, "rgb(235,80,14)"], [0.766, "rgb(229,71,11)"], [0.7872, "rgb(223,63,8)"], [0.8085, "rgb(216,55,6)"], [0.8298, "rgb(208,47,5)"], [0.8511, "rgb(200,40,3)"], [0.8723, "rgb(190,33,2)"], [0.8936, "rgb(180,27,1)"], [0.9149, "rgb(169,22,1)"], [0.9362, "rgb(158,16,1)"], [0.9574, "rgb(146,11,1)"], [0.9787, "rgb(133,7,2)"], [1.0, "rgb(122,4,3)"]], "afmhot": [[0.0, "rgb(0,0,0)"], [0.0213, "rgb(34,0,0)"], [0.0426, "rgb(56,0,0)"], [0.0638, "rgb(74,0,0)"], [0.0851, "rgb(90,0,0)"], [0.1064, "rgb(106,0,0)"], [0.1277, "rgb(120,0,0)"], [0.1489, "rgb(134,7,0)"], [0.1702, "rgb(148,20,0)"], [0.1915, "rgb(160,32,0)"], [0.2128, "rgb(172,45,0)"], [0.234, "rgb(184,56,0)"], [0.2553, "rgb(196,68,0)"], [0.2766, "rgb(208,80,0)"], [0.2979, "rgb(218,90,0)"], [0.3191, "rgb(230,102,0)"], [0.3404, "rgb(240,112,0)"], [0.3617, "rgb(250,122,0)"], [0.383, "rgb(255,132,5)"], [0.4043, "rgb(255,142,15)"], [0.4255, "rgb(255,153,25)"], [0.4468, "rgb(255,162,35)"], [0.4681, "rgb(255,172,45)"], [0.4894, "rgb(255,182,55)"], [0.5106, "rgb(255,190,63)"], [0.5319, "rgb(255,200,73)"], [0.5532, "rgb(255,210,83)"], [0.5745, "rgb(255,219,91)"], [0.5957, "rgb(255,228,101)"], [0.617, "rgb(255,236,109)"], [0.6383, "rgb(255,244,117)"], [0.6596, "rgb(255,254,127)"], [0.6809, "rgb(255,255,135)"], [0.7021, "rgb(255,255,143)"], [0.7234, "rgb(255,255,153)"], [0.7447, "rgb(255,255,161)"], [0.766, "rgb(255,255,169)"], [0.7872, "rgb(255,255,177)"], [0.8085, "rgb(255,255,185)"], [0.8298, "rgb(255,255,193)"], [0.8511, "rgb(255,255,201)"], [0.8723, "rgb(255,255,209)"], [0.8936, "rgb(255,255,217)"], [0.9149, "rgb(255,255,225)"], [0.9362, "rgb(255,255,233)"], [0.9574, "rgb(255,255,241)"], [0.9787, "rgb(255,255,249)"], [1.0, "rgb(255,255,255)"]], "viridis": [[0.0, "rgb(68,1,84)"], [0.0213, "rgb(72,26,108)"], [0.0426, "rgb(72,40,120)"], [0.0638, "rgb(70,51,127)"], [0.0851, "rgb(67,61,132)"], [0.1064, "rgb(64,70,136)"], [0.1277, "rgb(61,78,138)"], [0.1489, "rgb(57,85,140)"], [0.1702, "rgb(54,93,141)"], [0.1915, "rgb(51,99,141)"], [0.2128, "rgb(48,105,142)"], [0.234, "rgb(46,111,142)"], [0.2553, "rgb(43,116,142)"], [0.2766, "rgb(41,122,142)"], [0.2979, "rgb(39,127,142)"], [0.3191, "rgb(37,132,142)"], [0.3404, "rgb(35,137,142)"], [0.3617, "rgb(33,142,141)"], [0.383, "rgb(32,146,140)"], [0.4043, "rgb(31,151,139)"], [0.4255, "rgb(30,156,137)"], [0.4468, "rgb(31,161,136)"], [0.4681, "rgb(33,165,133)"], [0.4894, "rgb(36,170,131)"], [0.5106, "rgb(39,173,129)"], [0.5319, "rgb(45,178,125)"], [0.5532, "rgb(52,182,121)"], [0.5745, "rgb(58,186,118)"], [0.5957, "rgb(66,190,113)"], [0.617, "rgb(74,193,109)"], [0.6383, "rgb(82,197,105)"], [0.6596, "rgb(92,200,99)"], [0.6809, "rgb(101,203,94)"], [0.7021, "rgb(110,206,88)"], [0.7234, "rgb(122,209,81)"], [0.7447, "rgb(132,212,75)"], [0.766, "rgb(142,214,69)"], [0.7872, "rgb(152,216,62)"], [0.8085, "rgb(162,218,55)"], [0.8298, "rgb(173,220,48)"], [0.8511, "rgb(184,222,41)"], [0.8723, "rgb(194,223,35)"], [0.8936, "rgb(205,225,29)"], [0.9149, "rgb(216,226,25)"], [0.9362, "rgb(226,228,24)"], [0.9574, "rgb(236,229,27)"], [0.9787, "rgb(246,230,32)"], [1.0, "rgb(253,231,37)"]], "magma": [[0.0, "rgb(0,0,4)"], [0.0213, "rgb(11,9,36)"], [0.0426, "rgb(24,15,61)"], [0.0638, "rgb(36,18,83)"], [0.0851, "rgb(49,17,101)"], [0.1064, "rgb(63,15,114)"], [0.1277, "rgb(74,16,121)"], [0.1489, "rgb(86,20,125)"], [0.1702, "rgb(96,24,128)"], [0.1915, "rgb(106,28,129)"], [0.2128, "rgb(115,32,129)"], [0.234, "rgb(124,35,130)"], [0.2553, "rgb(134,39,129)"], [0.2766, "rgb(144,42,129)"], [0.2979, "rgb(152,45,128)"], [0.3191, "rgb(161,48,126)"], [0.3404, "rgb(170,51,125)"], [0.3617, "rgb(178,53,123)"], [0.383, "rgb(186,56,120)"], [0.4043, "rgb(194,59,117)"], [0.4255, "rgb(202,62,114)"], [0.4468, "rgb(210,66,111)"], [0.4681, "rgb(217,70,107)"], [0.4894, "rgb(224,76,103)"], [0.5106, "rgb(229,80,100)"], [0.5319, "rgb(235,87,96)"], [0.5532, "rgb(240,95,94)"], [0.5745, "rgb(243,101,92)"], [0.5957, "rgb(246,110,92)"], [0.617, "rgb(248,118,92)"], [0.6383, "rgb(250,125,94)"], [0.6596, "rgb(251,135,97)"], [0.6809, "rgb(252,142,100)"], [0.7021, "rgb(253,150,104)"], [0.7234, "rgb(254,159,109)"], [0.7447, "rgb(254,167,114)"], [0.766, "rgb(254,174,119)"], [0.7872, "rgb(254,182,124)"], [0.8085, "rgb(254,189,130)"], [0.8298, "rgb(254,196,136)"], [0.8511, "rgb(254,204,143)"], [0.8723, "rgb(254,211,149)"], [0.8936, "rgb(253,218,156)"], [0.9149, "rgb(253,226,163)"], [0.9362, "rgb(253,233,170)"], [0.9574, "rgb(252,240,178)"], [0.9787, "rgb(252,247,185)"], [1.0, "rgb(252,253,191)"]], "plasma": [[0.0, "rgb(13,8,135)"], [0.0213, "rgb(51,5,151)"], [0.0426, "rgb(70,3,159)"], [0.0638, "rgb(85,2,164)"], [0.0851, "rgb(97,0,167)"], [0.1064, "rgb(110,0,168)"], [0.1277, "rgb(120,1,168)"], [0.1489, "rgb(131,5,167)"], [0.1702, "rgb(141,11,165)"], [0.1915, "rgb(149,17,161)"], [0.2128, "rgb(157,24,157)"], [0.234, "rgb(165,31,153)"], [0.2553, "rgb(172,38,148)"], [0.2766, "rgb(179,44,142)"], [0.2979, "rgb(184,50,137)"], [0.3191, "rgb(191,57,132)"], [0.3404, "rgb(196,62,127)"], [0.3617, "rgb(201,68,122)"], [0.383, "rgb(205,74,118)"], [0.4043, "rgb(210,79,113)"], [0.4255, "rgb(214,85,109)"], [0.4468, "rgb(218,91,105)"], [0.4681, "rgb(222,97,100)"], [0.4894, "rgb(226,102,96)"], [0.5106, "rgb(229,107,93)"], [0.5319, "rgb(233,113,88)"], [0.5532, "rgb(236,119,84)"], [0.5745, "rgb(239,124,81)"], [0.5957, "rgb(241,131,76)"], [0.617, "rgb(244,136,73)"], [0.6383, "rgb(246,141,69)"], [0.6596, "rgb(248,148,65)"], [0.6809, "rgb(249,154,62)"], [0.7021, "rgb(251,159,58)"], [0.7234, "rgb(252,166,54)"], [0.7447, "rgb(253,172,51)"], [0.766, "rgb(253,178,47)"], [0.7872, "rgb(254,184,44)"], [0.8085, "rgb(254,190,42)"], [0.8298, "rgb(253,197,39)"], [0.8511, "rgb(253,203,38)"], [0.8723, "rgb(252,210,37)"], [0.8936, "rgb(250,216,36)"], [0.9149, "rgb(248,223,37)"], [0.9362, "rgb(246,230,38)"], [0.9574, "rgb(244,237,39)"], [0.9787, "rgb(241,244,38)"], [1.0, "rgb(240,249,33)"]]};

function getContrastRange(matrixZ = null) {
  const mode = state.contrast || 'high';

  // Coronagraph Dynamic Recalculation:
  // If diagonal is masked, dynamically recalibrate palette strictly to unmasked off-diagonal elements
  if (state.maskDiagonal && matrixZ && Array.isArray(matrixZ)) {
    const validVals = [];
    for (let i = 0; i < matrixZ.length; i++) {
      const row = matrixZ[i];
      if (!row) continue;
      for (let j = 0; j < row.length; j++) {
        const v = row[j];
        if (v !== null && v !== undefined && !isNaN(v) && isFinite(v)) {
          validVals.push(v);
        }
      }
    }

    if (validVals.length > 0) {
      validVals.sort((a, b) => a - b);
      const getP = (p) => {
        const idx = Math.min(validVals.length - 1, Math.max(0, Math.floor(p * (validVals.length - 1))));
        return validVals[idx];
      };

      let zmin, zmax;
      if (mode === 'medium') {
        zmin = Math.max(0, getP(0.02));
        zmax = Math.max(zmin + 0.4, getP(0.98));
      } else if (mode === 'full') {
        zmin = Math.max(0, validVals[0]);
        zmax = Math.max(zmin + 0.5, validVals[validVals.length - 1]);
      } else {
        // 'high' (default): expands palette across faint off-diagonal coupled peaks
        zmin = Math.max(0, getP(0.05));
        zmax = Math.max(zmin + 0.35, getP(0.95));
      }
      return { zmin: parseFloat(zmin.toFixed(2)), zmax: parseFloat(zmax.toFixed(2)), isCoronagraph: true };
    }
  }

  if (mode === 'medium') return { zmin: 0.5, zmax: 6.0, isCoronagraph: false };
  if (mode === 'full') return { zmin: 0.0, zmax: 12.0, isCoronagraph: false };
  return { zmin: 0.5, zmax: 4.0, isCoronagraph: false };
}

function getColormapScale(name) {
  if (typeof MATPLOTLIB_COLORSCALES !== 'undefined' && MATPLOTLIB_COLORSCALES[name]) {
    return MATPLOTLIB_COLORSCALES[name];
  }
  return MATPLOTLIB_COLORSCALES ? MATPLOTLIB_COLORSCALES.inferno : 'Hot';
}

function createFalContourTrace(xGrid, yGrid, zMat, level, color, width, dash, label) {
  if (level === undefined || level === null || isNaN(level)) return null;

  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < zMat.length; i++) {
    const row = zMat[i];
    if (!row) continue;
    for (let j = 0; j < row.length; j++) {
      const v = row[j];
      if (v !== null && v !== undefined && !isNaN(v)) {
        if (v < minZ) minZ = v;
        if (v > maxZ) maxZ = v;
      }
    }
  }

  // Ensure contour level is within valid data range
  if (level < minZ || level > maxZ) return null;

  return {
    x: xGrid,
    y: yGrid,
    z: zMat,
    type: 'contour',
    showscale: false,
    hoverinfo: 'none',
    autocontour: false,
    contours: {
      start: level,
      end: level,
      size: 1,
      coloring: 'none',
      showlines: true
    },
    line: {
      color: color,
      width: width || 1.6,
      dash: dash || 'solid'
    },
    name: label
  };
}

function renderMatrixPlot() {
  if (!state.coherenceData) return;
  const c = state.coherenceData;
  const th = getThemeColors();
  const f = c.f_grid;
  const f_min = f[0];
  const f_max = f[f.length - 1];

  let matrixZ = c.z_matrix;
  if (state.maskDiagonal) {
    const bw_2R = c.bw_2R || (2.0 / (c.t_span || 1000.0));
    const halfWidth = bw_2R * 0.5 * (state.maskDiagonalWidthFactor || 1.0);
    matrixZ = c.z_matrix.map((row, i) =>
      row.map((val, j) => {
        if (Math.abs(f[i] - f[j]) <= halfWidth) {
          return null;
        }
        return val;
      })
    );
  }

  const { zmin, zmax, isCoronagraph } = getContrastRange(matrixZ);

  const heatmapTrace = {
    x: f,
    y: f,
    z: matrixZ,
    type: 'heatmap',
    colorscale: getColormapScale(state.colormap),
    zmin: zmin,
    zmax: zmax,
    hoverinfo: 'text',
    text: matrixZ.map((row, i) =>
      row.map((val, j) => {
        if (val === null) {
          return `f₁: ${f[j].toFixed(4)} d⁻¹<br>f₂: ${f[i].toFixed(4)} d⁻¹<br><em>Diagonal Masked (${(state.maskDiagonalWidthFactor || 1.0).toFixed(2)}×2ℛ)</em>`;
        }
        const p1 = f[j] > 0 ? (1.0 / f[j]).toFixed(1) : '∞';
        const p2 = f[i] > 0 ? (1.0 / f[i]).toFixed(1) : '∞';
        return `f₁: ${f[j].toFixed(4)} d⁻¹ (P₁=${p1}d)<br>f₂: ${f[i].toFixed(4)} d⁻¹ (P₂=${p2}d)<br>z: ${val.toFixed(2)}`;
      })
    ),
    colorbar: {
      title: { text: isCoronagraph ? 'z [Coronagraph]' : 'Fisher z', font: { color: th.titleColor, size: 11 } },
      tickfont: { color: th.tickColor, size: 10 },
      len: 0.9,
      thickness: 14
    }
  };

  const shapes = getMatrixOverlayShapes();

  const layout = {
    paper_bgcolor: th.paperBg,
    plot_bgcolor: th.paperBg,
    margin: { l: 55, r: 15, t: 25, bottom: 45 },
    xaxis: {
      title: { text: 'Frequency f₁ (d⁻¹)', font: { color: th.titleColor, size: 11 } },
      tickfont: { color: th.tickColor, size: 10 },
      range: [f_min, f_max],
      gridcolor: th.gridColor,
      showline: true,
      linecolor: th.axisLineColor,
      linewidth: 1.2,
      mirror: true
    },
    yaxis: {
      title: { text: 'Frequency f₂ (d⁻¹)', font: { color: th.titleColor, size: 11 } },
      tickfont: { color: th.tickColor, size: 10 },
      range: [f_min, f_max],
      scaleanchor: 'x',
      scaleratio: 1,
      gridcolor: th.gridColor,
      showline: true,
      linecolor: th.axisLineColor,
      linewidth: 1.2,
      mirror: true
    },
    shapes: shapes
  };

  const matrixTraces = [heatmapTrace];

  if (state.showFalContours && state.coherenceData) {
    const fap1 = state.coherenceData.fap1;
    const fap01 = state.coherenceData.fap01;
    const fap1An = state.coherenceData.fap1_analytical;
    const fap01An = state.coherenceData.fap01_analytical;
    const isMc = state.coherenceData.fap_type === 'montecarlo' || state.coherenceData.fap_type === 'rednoise';
    const rawZ = state.coherenceData.z_matrix;

    if (isMc) {
      // Analytical benchmark reference contours (fine dotted lines)
      const tr1An = createFalContourTrace(f, f, rawZ, fap1An, '#00E676', 1.2, 'dot', '1.0% FAL (Analytical Reference)');
      if (tr1An) matrixTraces.push(tr1An);
      const tr01An = createFalContourTrace(f, f, rawZ, fap01An, '#FF2D55', 1.2, 'dot', '0.1% FAL (Analytical Reference)');
      if (tr01An) matrixTraces.push(tr01An);

      // Primary Red-Noise MC FAL contours
      const tr1 = createFalContourTrace(f, f, rawZ, fap1, '#00E676', 1.6, 'dash', '1.0% FAL (Red-Noise MC)');
      if (tr1) matrixTraces.push(tr1);
      const tr01 = createFalContourTrace(f, f, rawZ, fap01, '#FF2D55', 1.8, 'dashdot', '0.1% FAL (Red-Noise MC)');
      if (tr01) matrixTraces.push(tr01);
    } else {
      // Primary Analytical FAL contours
      const tr1 = createFalContourTrace(f, f, rawZ, fap1, '#00E676', 1.6, 'dash', '1.0% FAL (Analytical)');
      if (tr1) matrixTraces.push(tr1);
      const tr01 = createFalContourTrace(f, f, rawZ, fap01, '#FF2D55', 1.8, 'dashdot', '0.1% FAL (Analytical)');
      if (tr01) matrixTraces.push(tr01);
    }
  }

  const config = { responsive: true, displayModeBar: false };
  Plotly.react(el.plotMatrix, matrixTraces, layout, config);

  if (!el.plotMatrix._hasMatrixListeners) {
    el.plotMatrix.on('plotly_click', (data) => {
      if (data.points && data.points.length > 0) {
        const pt = data.points[0];
        updateActiveSlice(pt.x, pt.y);
      }
    });

    el.plotMatrix.on('plotly_relayout', (eventData) => {
      handleMatrixZoom(eventData);
    });

    el.plotMatrix._hasMatrixListeners = true;
  }
}

function handleMatrixZoom(eventData) {
  if (!state.coherenceData || !eventData) return;
  const f = state.coherenceData.f_grid;
  const fullMin = f[0];
  const fullMax = f[f.length - 1];

  const hasZoomKey = (
    'xaxis.range[0]' in eventData ||
    'xaxis.range' in eventData ||
    'xaxis.autorange' in eventData ||
    'yaxis.range[0]' in eventData ||
    'yaxis.range' in eventData ||
    'yaxis.autorange' in eventData ||
    'autosize' in eventData
  );
  if (!hasZoomKey) return;

  if (eventData['xaxis.autorange'] || eventData['yaxis.autorange'] || eventData['autosize']) {
    state.zoom = {
      isZoomed: false,
      f1_min: fullMin,
      f1_max: fullMax,
      f2_min: fullMin,
      f2_max: fullMax
    };
    if (el.btnResetZoom) el.btnResetZoom.style.display = 'none';
  } else {
    let x0, x1, y0, y1;
    if (eventData['xaxis.range[0]'] !== undefined && eventData['xaxis.range[1]'] !== undefined) {
      x0 = Math.min(eventData['xaxis.range[0]'], eventData['xaxis.range[1]']);
      x1 = Math.max(eventData['xaxis.range[0]'], eventData['xaxis.range[1]']);
      y0 = Math.min(eventData['yaxis.range[0]'], eventData['yaxis.range[1]']);
      y1 = Math.max(eventData['yaxis.range[0]'], eventData['yaxis.range[1]']);
    } else if (eventData['xaxis.range'] && Array.isArray(eventData['xaxis.range'])) {
      x0 = Math.min(eventData['xaxis.range'][0], eventData['xaxis.range'][1]);
      x1 = Math.max(eventData['xaxis.range'][0], eventData['xaxis.range'][1]);
      y0 = Math.min(eventData['yaxis.range'][0], eventData['yaxis.range'][1]);
      y1 = Math.max(eventData['yaxis.range'][0], eventData['yaxis.range'][1]);
    } else if (el.plotMatrix.layout && el.plotMatrix.layout.xaxis && el.plotMatrix.layout.xaxis.range) {
      const rx = el.plotMatrix.layout.xaxis.range;
      const ry = el.plotMatrix.layout.yaxis.range;
      x0 = Math.min(rx[0], rx[1]);
      x1 = Math.max(rx[0], rx[1]);
      y0 = Math.min(ry[0], ry[1]);
      y1 = Math.max(ry[0], ry[1]);
    }

    if (x0 !== undefined && x1 !== undefined) {
      x0 = Math.max(fullMin, x0);
      x1 = Math.min(fullMax, x1);
      y0 = Math.max(fullMin, y0);
      y1 = Math.min(fullMax, y1);

      const isFull = Math.abs(x0 - fullMin) < 1e-4 && Math.abs(x1 - fullMax) < 1e-4;
      state.zoom = {
        isZoomed: !isFull,
        f1_min: x0,
        f1_max: x1,
        f2_min: y0,
        f2_max: y1
      };
      if (el.btnResetZoom) el.btnResetZoom.style.display = state.zoom.isZoomed ? 'inline-block' : 'none';
    }
  }

  renderHorizontalCut();
  renderAntiDiagonalCut();
}

function resetMatrixZoom() {
  if (!state.coherenceData) return;
  const f = state.coherenceData.f_grid;
  const fullMin = f[0];
  const fullMax = f[f.length - 1];
  state.zoom = {
    isZoomed: false,
    f1_min: fullMin,
    f1_max: fullMax,
    f2_min: fullMin,
    f2_max: fullMax
  };
  if (el.btnResetZoom) el.btnResetZoom.style.display = 'none';

  Plotly.relayout(el.plotMatrix, {
    'xaxis.range': [fullMin, fullMax],
    'yaxis.range': [fullMin, fullMax],
    'xaxis.autorange': true,
    'yaxis.autorange': true
  });

  renderHorizontalCut();
  renderAntiDiagonalCut();
  showToast('Reset zoom to full grid.');
}

function getMatrixOverlayShapes() {
  const c = state.coherenceData;
  const f = c.f_grid;
  const f_rot = 1.0 / c.p_rot;
  const f_min = f[0];
  const f_max = f[f.length - 1];

  const f1_sel = state.activeF1 || f_rot;
  const f2_sel = state.activeF2 || f_rot;
  const f_mid = (f1_sel + f2_sel) / 2.0;

  const shapes = [];

  // 1. Main Diagonal
  shapes.push({
    type: 'line',
    x0: f_min, y0: f_min, x1: f_max, y1: f_max,
    line: { color: '#B0BEC5', width: 1.2, dash: 'solid' }
  });

  // 2. Rotation Harmonics Gridlines
  const nHarm = state.nHarmonics || 2;
  const dashStyles = ['dash', 'dot', 'dashdot', 'dot', 'dash'];
  for (let k = 1; k <= nHarm; k++) {
    const fk = k * f_rot;
    if (fk <= f_max) {
      const dStyle = dashStyles[(k - 1) % dashStyles.length];
      shapes.push({
        type: 'line',
        x0: fk, y0: f_min, x1: fk, y1: f_max,
        line: { color: '#00E5FF', width: k === 1 ? 1.2 : 1.0, dash: dStyle }
      });
      shapes.push({
        type: 'line',
        x0: f_min, y0: fk, x1: f_max, y1: fk,
        line: { color: '#00E5FF', width: k === 1 ? 1.2 : 1.0, dash: dStyle }
      });
    }
  }

  // 3. Custom Periodicities Gridlines
  if (state.customPeriods && state.customPeriods.length > 0) {
    state.customPeriods.forEach((P) => {
      const f_custom = 1.0 / P;
      if (f_custom >= f_min && f_custom <= f_max) {
        shapes.push({
          type: 'line',
          x0: f_custom, y0: f_min, x1: f_custom, y1: f_max,
          line: { color: '#E040FB', width: 1.3, dash: 'dashdot' }
        });
        shapes.push({
          type: 'line',
          x0: f_min, y0: f_custom, x1: f_max, y1: f_custom,
          line: { color: '#E040FB', width: 1.3, dash: 'dashdot' }
        });
      }
    });
  }

  // 4. Horizontal Target Cuts Tracks
  if (state.horizontalCuts && state.horizontalCuts.length > 0) {
    state.horizontalCuts.forEach(cut => {
      if (cut.f2 >= f_min && cut.f2 <= f_max) {
        shapes.push({
          type: 'line',
          x0: f_min, y0: cut.f2, x1: f_max, y1: cut.f2,
          line: { color: cut.color || '#00E5FF', width: 1.2, dash: 'dash' }
        });
      }
    });
  }

  // 5. Active Cursor Horizontal Slice Line
  shapes.push({
    type: 'line',
    x0: f_min, y0: f2_sel, x1: f_max, y1: f2_sel,
    line: { color: '#FF9100', width: 1.8 }
  });

  // 6. Active Anti-Diagonal Beat Track
  shapes.push({
    type: 'line',
    x0: Math.max(f_min, 2.0 * f_mid - f_max),
    y0: Math.min(f_max, 2.0 * f_mid - f_min),
    x1: Math.min(f_max, 2.0 * f_mid - f_min),
    y1: Math.max(f_min, 2.0 * f_mid - f_max),
    line: { color: '#00E676', width: 1.6, dash: 'dash' }
  });

  // 7. Selected Intersection Node Marker
  shapes.push({
    type: 'circle',
    xref: 'x', yref: 'y',
    x0: f1_sel - 0.002, y0: f2_sel - 0.002,
    x1: f1_sel + 0.002, y1: f2_sel + 0.002,
    fillcolor: '#FF2D55',
    line: { color: '#FFF', width: 1.5 }
  });

  return shapes;
}

function updateMatrixShapes() {
  if (!state.coherenceData || !el.plotMatrix.layout) return;
  Plotly.relayout(el.plotMatrix, { shapes: getMatrixOverlayShapes() });
}

function renderHorizontalCut() {
  if (!state.slicesData || !el.plotHorizontal) return;
  const s = state.slicesData;
  const c = state.coherenceData;
  const df_r = c.df_rayleigh;
  const th = getThemeColors();

  const isPeriod = state.horizDomain === 'period';
  const isLog = state.horizYScale === 'log';
  const f_min = c.f_grid ? c.f_grid[0] : 0.0;
  const f_max = c.f_grid ? c.f_grid[c.f_grid.length - 1] : 0.15;
  const p_min = f_max > 0 ? (1.0 / f_max) : 5.0;
  const p_max = Math.min(250.0, 3.5 * (c.p_rot || 27.28));

  const allCuts = (s.horizontal_cuts && s.horizontal_cuts.length > 0) ? s.horizontal_cuts : [s.horizontal];

  // Determine cuts to plot based on single vs subpanels mode
  let cutsToPlot = [];
  if (state.horizLayout === 'subpanels') {
    cutsToPlot = allCuts.filter(cut => cut.active !== false);
    if (cutsToPlot.length === 0) cutsToPlot = [allCuts[0]];
  } else {
    // Single cut view (default)
    let selected = allCuts.find(cut => cut.id === state.selectedHorizCutId);
    if (!selected && state.selectedHorizCutId === 'cursor' && s.horizontal) {
      selected = s.horizontal;
    }
    if (!selected) {
      selected = allCuts[0];
      state.selectedHorizCutId = selected ? selected.id : null;
    }
    cutsToPlot = [selected];
  }

  // Common X-axis configuration with protected dynamic bounds
  const xAxisConfig = {
    title: { text: isPeriod ? 'Coupled Period P₁ (days)' : 'Coupled Frequency f₁ (d⁻¹)', font: { color: th.titleColor, size: 10.5 } },
    tickfont: { color: th.tickColor, size: 9.5 },
    gridcolor: th.gridColor,
    showline: true,
    linecolor: th.axisLineColor,
    linewidth: 1.2,
    mirror: true
  };

  if (state.zoom && state.zoom.isZoomed) {
    if (isPeriod) {
      xAxisConfig.range = [Math.max(p_min, 1.0 / state.zoom.f1_max), Math.min(p_max, 1.0 / state.zoom.f1_min)];
    } else {
      xAxisConfig.range = [state.zoom.f1_min, state.zoom.f1_max];
    }
  } else {
    if (isPeriod) {
      xAxisConfig.range = [p_min, p_max];
      xAxisConfig.autorange = false;
    } else {
      xAxisConfig.range = [f_min, f_max];
      xAxisConfig.autorange = false;
    }
  }

  if (state.horizLayout === 'subpanels' && cutsToPlot.length > 1) {
    // Render Stacked Subpanels
    const nSub = cutsToPlot.length;
    const gap = 0.04;
    const panelHeight = (1.0 - (nSub - 1) * gap) / nSub;
    const traces = [];
    const layout = {
      paper_bgcolor: th.paperBg,
      plot_bgcolor: th.plotBg,
      margin: { l: 55, r: 15, t: 25, bottom: 45 },
      xaxis: xAxisConfig,
      shapes: [],
      showlegend: false
    };

    cutsToPlot.forEach((cut, idx) => {
      const plotX = isPeriod ? cut.period1 : cut.f1;
      const plotY = isLog ? cut.z.map(v => Math.max(0.1, v)) : cut.z;
      const f2Val = cut.f2 !== undefined ? cut.f2 : (cut.f2_fixed || 0.0);
      const yaxisName = idx === 0 ? 'yaxis' : `yaxis${idx + 1}`;
      const yaxisRef = idx === 0 ? 'y' : `y${idx + 1}`;

      const hoverText = cut.f1.map((f, i) =>
        `Frequency f₁: ${f.toFixed(4)} d⁻¹<br>Period P₁: ${cut.period1[i].toFixed(1)} d<br>z: ${cut.z[i].toFixed(2)}<br>[Cut at f₂ = ${f2Val.toFixed(4)} d⁻¹]`
      );

      traces.push({
        x: plotX,
        y: plotY,
        type: 'scatter',
        mode: 'lines',
        line: { color: cut.color || '#00E5FF', width: 2.0 },
        yaxis: yaxisRef,
        hoverinfo: 'text',
        text: hoverText,
        name: cut.label || `f₂ = ${f2Val.toFixed(4)}`
      });

      if (cut.peak_f1) {
        const pkX = isPeriod ? cut.peak_p1 : cut.peak_f1;
        const pkY = isLog ? Math.max(0.1, cut.peak_z) : cut.peak_z;
        traces.push({
          x: [pkX],
          y: [pkY],
          type: 'scatter',
          mode: 'markers',
          marker: { size: 7, color: cut.color || '#00E5FF', line: { color: '#FFFFFF', width: 1.2 } },
          yaxis: yaxisRef,
          hoverinfo: 'text',
          text: [`Peak: z = ${cut.peak_z.toFixed(2)} at ${isPeriod ? cut.peak_p1.toFixed(1) + ' d' : cut.peak_f1.toFixed(4) + ' d⁻¹'}`]
        });
      }

      const yBot = 1.0 - (idx + 1) * panelHeight - idx * gap;
      const yTop = yBot + panelHeight;
      const maxVal = Math.max(4.0, ...plotY);

      layout[yaxisName] = {
        domain: [Math.max(0, yBot), Math.min(1, yTop)],
        title: { text: `${cut.label || `f₂=${f2Val.toFixed(3)}`}<br>[z]`, font: { color: th.titleColor, size: 9.5 } },
        tickfont: { color: th.tickColor, size: 9 },
        gridcolor: th.gridColor,
        showline: true,
        linecolor: th.axisLineColor,
        linewidth: 1.2,
        mirror: true,
        type: isLog ? 'log' : 'linear',
        range: isLog ? [Math.log10(0.1), Math.log10(maxVal * 1.25)] : [0, maxVal * 1.15]
      };

      // FAP lines per subpanel
      layout.shapes.push(
        { type: 'line', xref: 'paper', yref: yaxisRef, x0: 0, x1: 1, y0: c.fap01, y1: c.fap01, line: { color: '#FF2D55', width: 0.9, dash: 'dash' } },
        { type: 'line', xref: 'paper', yref: yaxisRef, x0: 0, x1: 1, y0: c.fap1,  y1: c.fap1,  line: { color: '#00E676', width: 0.9, dash: 'dash' } },
        { type: 'line', xref: 'paper', yref: yaxisRef, x0: 0, x1: 1, y0: c.fap5,  y1: c.fap5,  line: { color: '#AF52DE', width: 0.9, dash: 'dash' } }
      );
    });

    Plotly.react(el.plotHorizontal, traces, layout, { responsive: true, displayModeBar: false });
  } else {
    // Single Cut Mode (Default)
    const cut = cutsToPlot[0];
    const plotX = isPeriod ? cut.period1 : cut.f1;
    const plotY = isLog ? cut.z.map(v => Math.max(0.1, v)) : cut.z;
    const f2Val = cut.f2 !== undefined ? cut.f2 : (cut.f2_fixed || 0.0);
    const hoverText = cut.f1.map((f, i) =>
      `Frequency f₁: ${f.toFixed(4)} d⁻¹<br>Period P₁: ${cut.period1[i].toFixed(1)} d<br>z: ${cut.z[i].toFixed(2)}<br>[Cut at f₂ = ${f2Val.toFixed(4)} d⁻¹]`
    );

    const traces = [{
      x: plotX,
      y: plotY,
      type: 'scatter',
      mode: 'lines',
      line: { color: cut.color || '#00E5FF', width: 2.2 },
      hoverinfo: 'text',
      text: hoverText,
      name: cut.label || (isPeriod ? `P₂ = ${(1.0 / f2Val).toFixed(1)}d` : `f₂ = ${f2Val.toFixed(4)}`)
    }];

    if (cut.peak_f1) {
      const pkX = isPeriod ? cut.peak_p1 : cut.peak_f1;
      const pkY = isLog ? Math.max(0.1, cut.peak_z) : cut.peak_z;
      traces.push({
        x: [pkX],
        y: [pkY],
        type: 'scatter',
        mode: 'markers',
        marker: { size: 8, color: cut.color || '#00E5FF', line: { color: '#FFFFFF', width: 1.5 } },
        hoverinfo: 'text',
        text: [`Peak: z = ${cut.peak_z.toFixed(2)} at ${isPeriod ? cut.peak_p1.toFixed(1) + ' d' : cut.peak_f1.toFixed(4) + ' d⁻¹'}`],
        showlegend: false
      });
    }

    const shapes = [];
    const f_rot = 1.0 / c.p_rot;
    for (let k = 1; k <= (state.nHarmonics || 2); k++) {
      const fk = k * f_rot;
      if (!isPeriod) {
        shapes.push({
          type: 'rect', xref: 'x', yref: 'paper',
          x0: fk - df_r, x1: fk + df_r,
          y0: 0, y1: 1,
          fillcolor: th.harmonicBand, line: { width: 0 }
        });
      }
    }

    shapes.push(
      { type: 'line', xref: 'paper', x0: 0, x1: 1, y0: c.fap01, y1: c.fap01, line: { color: '#FF2D55', width: 1.0, dash: 'dash' } },
      { type: 'line', xref: 'paper', x0: 0, x1: 1, y0: c.fap1,  y1: c.fap1,  line: { color: '#00E676', width: 1.0, dash: 'dash' } },
      { type: 'line', xref: 'paper', x0: 0, x1: 1, y0: c.fap5,  y1: c.fap5,  line: { color: '#AF52DE', width: 1.0, dash: 'dash' } }
    );

    const maxVal = Math.max(5.0, ...plotY);
    const yAxisConfig = {
      title: { text: isLog ? 'Coherence z [log scale]' : 'Coherence z(f₁)', font: { color: th.titleColor, size: 10.5 } },
      tickfont: { color: th.tickColor, size: 9.5 },
      gridcolor: th.gridColor,
      showline: true,
      linecolor: th.axisLineColor,
      linewidth: 1.2,
      mirror: true,
      type: isLog ? 'log' : 'linear',
      range: isLog ? [Math.log10(0.1), Math.log10(maxVal * 1.25)] : [0, maxVal * 1.15]
    };

    const layout = {
      paper_bgcolor: th.paperBg,
      plot_bgcolor: th.plotBg,
      margin: { l: 45, r: 15, t: 30, bottom: 40 },
      xaxis: xAxisConfig,
      yaxis: yAxisConfig,
      shapes: shapes,
      showlegend: true,
      legend: {
        orientation: 'h',
        x: 0,
        y: 1.15,
        font: { color: th.titleColor, size: 9.5 },
        bgcolor: th.legendBg,
        bordercolor: th.legendBorder,
        borderwidth: 1
      }
    };

    Plotly.react(el.plotHorizontal, traces, layout, { responsive: true, displayModeBar: false });
  }
}

function renderAntiDiagonalCut() {
  if (!state.slicesData || !el.plotAntiDiagonal) return;
  const s = state.slicesData;
  const ad = s.antidiagonal;
  const c = state.coherenceData;
  const df_r = c.df_rayleigh;
  const th = getThemeColors();

  const isPeriod = state.beatDomain === 'period';
  const isLog = state.beatYScale === 'log';
  let plotX = [];
  let plotY = [];
  let hoverText = [];

  const f_min = c.f_grid ? c.f_grid[0] : 0.0;
  const f_max = c.f_grid ? c.f_grid[c.f_grid.length - 1] : 0.15;
  const p_min_beat = 3.0;
  const p_max_beat = Math.min(250.0, 3.5 * (c.p_rot || 27.28));
  const max_delta = (f_max - f_min) / 2.0;

  if (isPeriod) {
    const pts = [];
    for (let i = 0; i < ad.delta_f.length; i++) {
      const df = Math.abs(ad.delta_f[i]);
      if (df > 0.001) {
        const p_beat = 1.0 / (2.0 * df);
        if (p_beat >= p_min_beat && p_beat <= p_max_beat) {
          pts.push({ x: p_beat, y: ad.z[i], df: ad.delta_f[i] });
        }
      }
    }
    pts.sort((a, b) => a.x - b.x);
    plotX = pts.map(p => p.x);
    plotY = pts.map(p => isLog ? Math.max(0.1, p.y) : p.y);
    hoverText = pts.map(p => `Beat Period P_beat: ${p.x.toFixed(1)} d<br>Δf: ${p.df.toFixed(4)} d⁻¹<br>z: ${p.y.toFixed(2)}`);
  } else {
    plotX = ad.delta_f;
    plotY = isLog ? ad.z.map(v => Math.max(0.1, v)) : ad.z;
    hoverText = ad.delta_f.map((df, i) => {
      const p_str = Math.abs(df) > 0.001 ? (1.0 / (2.0 * Math.abs(df))).toFixed(1) + ' d' : '∞ (Diagonal)';
      return `Separation Δf: ${df.toFixed(4)} d⁻¹<br>Beat Period: ${p_str}<br>z: ${ad.z[i].toFixed(2)}`;
    });
  }

  const traceBeat = {
    x: plotX,
    y: plotY,
    type: 'scatter',
    mode: 'lines',
    line: { color: '#00E676', width: 2.2 },
    hoverinfo: 'text',
    text: hoverText,
    name: isPeriod ? 'Beat Cut z(P_beat)' : 'Beat Cut z(Δf)'
  };

  const shapes = [];
  if (!isPeriod) {
    shapes.push({
      type: 'rect', xref: 'x', yref: 'paper', x0: -df_r, x1: df_r, y0: 0, y1: 1,
      fillcolor: 'rgba(0, 230, 118, 0.15)', line: { width: 0 }
    });
  }

  shapes.push(
    { type: 'line', xref: 'paper', x0: 0, x1: 1, y0: c.fap01, y1: c.fap01, line: { color: '#FF2D55', width: 1.0, dash: 'dash' } },
    { type: 'line', xref: 'paper', x0: 0, x1: 1, y0: c.fap1,  y1: c.fap1,  line: { color: '#00E676', width: 1.0, dash: 'dash' } },
    { type: 'line', xref: 'paper', x0: 0, x1: 1, y0: c.fap5,  y1: c.fap5,  line: { color: '#AF52DE', width: 1.0, dash: 'dash' } }
  );

  const xAxisTitle = isPeriod
    ? `Beat Period P_beat (days) [Carrier P_mid = ${ad.p_mid.toFixed(1)}d]`
    : `Separation Frequency Δf = (f₁ - f₂)/2 (d⁻¹) [Carrier P_mid = ${ad.p_mid.toFixed(1)}d]`;

  const yAxisTitle = isLog
    ? (isPeriod ? 'z(P_beat) [log scale]' : 'z(Δf) [log scale]')
    : (isPeriod ? 'z(P_beat)' : 'z(Δf)');

  const maxValAD = Math.max(5.0, ...(plotY.length > 0 ? plotY : [5.0]));
  const yAxisConfig = {
    title: { text: yAxisTitle, font: { color: th.titleColor, size: 10.5 } },
    tickfont: { color: th.tickColor, size: 9.5 },
    gridcolor: th.gridColor,
    showline: true,
    linecolor: th.axisLineColor,
    linewidth: 1.2,
    mirror: true,
    type: isLog ? 'log' : 'linear',
    range: isLog ? [Math.log10(0.1), Math.log10(maxValAD * 1.25)] : [0, maxValAD * 1.15]
  };

  const xAxisConfig = {
    title: { text: xAxisTitle, font: { color: th.titleColor, size: 10.5 } },
    tickfont: { color: th.tickColor, size: 9.5 },
    gridcolor: th.gridColor,
    showline: true,
    linecolor: th.axisLineColor,
    linewidth: 1.2,
    mirror: true
  };

  if (state.zoom && state.zoom.isZoomed) {
    const f1_box_min = Math.max(state.zoom.f1_min, 2.0 * ad.f_mid - state.zoom.f2_max);
    const f1_box_max = Math.min(state.zoom.f1_max, 2.0 * ad.f_mid - state.zoom.f2_min);
    if (f1_box_max > f1_box_min) {
      const df_min = f1_box_min - ad.f_mid;
      const df_max = f1_box_max - ad.f_mid;
      if (isPeriod) {
        const min_abs_df = Math.max(0.001, Math.min(Math.abs(df_min), Math.abs(df_max)));
        const max_abs_df = Math.max(Math.abs(df_min), Math.abs(df_max));
        xAxisConfig.range = [Math.max(p_min_beat, 1.0 / (2.0 * max_abs_df)), Math.min(p_max_beat, 1.0 / (2.0 * min_abs_df))];
      } else {
        xAxisConfig.range = [df_min, df_max];
      }
    } else {
      const half_w = (state.zoom.f1_max - state.zoom.f1_min) / 2.0;
      xAxisConfig.range = [-half_w, half_w];
    }
  } else {
    if (isPeriod) {
      xAxisConfig.range = [p_min_beat, p_max_beat];
      xAxisConfig.autorange = false;
    } else {
      xAxisConfig.range = [-max_delta, max_delta];
      xAxisConfig.autorange = false;
    }
  }

  const layout = {
    paper_bgcolor: th.paperBg,
    plot_bgcolor: th.plotBg,
    margin: { l: 45, r: 15, t: 15, bottom: 40 },
    xaxis: xAxisConfig,
    yaxis: yAxisConfig,
    shapes: shapes,
    showlegend: false
  };

  Plotly.react(el.plotAntiDiagonal, [traceBeat], layout, { responsive: true, displayModeBar: false });
}

async function exportPNG() {
  if (state.activeView === 'timeseries') {
    return exportDiagPNG();
  }
  if (state.activeView === 'welch1d') {
    return exportWelch1DPNG();
  }
  openExportModal();
}

function openExportModal() {
  if (!state.coherenceData || !state.slicesData) {
    showToast('Compute a coherence matrix first.');
    return;
  }
  if (el.exportColormap) el.exportColormap.value = state.colormap || 'inferno';
  if (el.exportHarmonicsCount) el.exportHarmonicsCount.value = state.nHarmonics || 2;
  if (el.exportResultsSection) el.exportResultsSection.style.display = 'none';
  if (el.exportFilesList) el.exportFilesList.innerHTML = '';
  if (el.exportModal) el.exportModal.style.display = 'flex';
}

function closeExportModal() {
  if (el.exportModal) el.exportModal.style.display = 'none';
}

async function runGranularExport() {
  if (!state.coherenceData || !state.slicesData) {
    showToast('Compute a coherence matrix first.');
    return;
  }
  
  const selected = [];
  if (el.chkExpHeatmap && el.chkExpHeatmap.checked) selected.push('heatmap');
  if (el.chkExpDiagonal && el.chkExpDiagonal.checked) selected.push('diagonal');
  if (el.chkExpHorizontal && el.chkExpHorizontal.checked) selected.push('horizontal');
  if (el.chkExpComposite && el.chkExpComposite.checked) selected.push('composite');
  if (el.chkExpCSV && el.chkExpCSV.checked) selected.push('csv');
  
  if (selected.length === 0) {
    showToast('Select at least one plot or table to export.');
    return;
  }
  
  try {
    if (el.btnRunExport) {
      el.btnRunExport.classList.add('loading');
      el.btnRunExport.querySelector('.btn-text').textContent = 'Generating...';
    }
    showToast('Generating selected publication plots and data...');
    
    const { zmin, zmax } = getContrastRange();
    const zoomPayload = (state.zoom && state.zoom.isZoomed) ? {
      is_zoomed: true,
      f1_min: state.zoom.f1_min,
      f1_max: state.zoom.f1_max,
      f2_min: state.zoom.f2_min,
      f2_max: state.zoom.f2_max
    } : {
      is_zoomed: false,
      f1_min: state.coherenceData.f_grid[0],
      f1_max: state.coherenceData.f_grid[state.coherenceData.f_grid.length - 1],
      f2_min: state.coherenceData.f_grid[0],
      f2_max: state.coherenceData.f_grid[state.coherenceData.f_grid.length - 1]
    };

    const payload = {
      selected_plots: selected,
      colormap: el.exportColormap ? el.exportColormap.value : state.colormap,
      vmin: zmin,
      vmax: zmax,
      n_harmonics: el.exportHarmonicsCount ? parseInt(el.exportHarmonicsCount.value) : state.nHarmonics,
      custom_periods: state.customPeriods,
      horiz_domain: state.horizDomain,
      beat_domain: state.beatDomain,
      horiz_yscale: state.horizYScale,
      beat_yscale: state.beatYScale,
      zoom: zoomPayload
    };

    const res = await fetch('/api/export_plots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.status === 'ok' && data.files) {
      renderExportResults(data.files);
      showToast(`Exported ${data.files.length} publication files successfully!`);
    } else {
      showToast(`Export error: ${data.message}`);
    }
  } catch (err) {
    console.error('Export plots error:', err);
    showToast('Failed to export plots.');
  } finally {
    if (el.btnRunExport) {
      el.btnRunExport.classList.remove('loading');
      el.btnRunExport.querySelector('.btn-text').textContent = 'Generate & Export Selected';
    }
  }
}

function renderExportResults(files) {
  if (!el.exportResultsSection || !el.exportFilesList) return;
  el.exportResultsSection.style.display = 'block';
  el.exportFilesList.innerHTML = '';
  
  files.forEach(f => {
    const item = document.createElement('div');
    item.className = 'export-file-result-item';
    const isCsv = f.filename.endsWith('.csv');
    item.innerHTML = `
      <div class="f-info">
        <span class="f-badge ${isCsv ? 'f-csv' : 'f-png'}">${isCsv ? 'CSV' : 'PNG'}</span>
        <div class="f-titles">
          <strong>${f.name}</strong>
          <span>${f.filename}</span>
        </div>
      </div>
      <div class="f-actions">
        <a href="${f.url}" target="_blank" download="${f.filename}" class="btn-download-file">Download</a>
      </div>
    `;
    el.exportFilesList.appendChild(item);
  });
}

async function exportCSV(cutType) {
  try {
    const res = await fetch('/api/export_csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cut_type: cutType })
    });
    const data = await res.json();
    if (data.status === 'ok') {
      const blob = new Blob([data.csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `coherence_${cutType}_cut_${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(`Exported ${cutType} cut CSV.`);
    }
  } catch (err) {
    console.error('CSV export error:', err);
  }
}

// -----------------------------------------------------------------------------
// VIEW 4: MULTI-CAMPAIGN & CROSS-INSTRUMENT COMPARISON
// -----------------------------------------------------------------------------
function setupComparisonUI() {
  if (!el.compDatasetASelect || !el.compDatasetBSelect) return;

  function populateCompDatasets() {
    const dsKeys = Object.keys(state.datasets);
    el.compDatasetASelect.innerHTML = '';
    el.compDatasetBSelect.innerHTML = '';

    dsKeys.forEach(k => {
      const optA = document.createElement('option');
      optA.value = k;
      optA.textContent = state.datasets[k].name;
      el.compDatasetASelect.appendChild(optA);

      const optB = document.createElement('option');
      optB.value = k;
      optB.textContent = state.datasets[k].name;
      el.compDatasetBSelect.appendChild(optB);
    });

    el.compDatasetASelect.value = 'harpsn';
    el.compDatasetBSelect.value = 'harpsn';

    updateCompPanelOptions('A');
    updateCompPanelOptions('B');
  }

  function updateCompPanelOptions(panel) {
    const dsSelect = panel === 'A' ? el.compDatasetASelect : el.compDatasetBSelect;
    const presetSelect = panel === 'A' ? el.compPresetASelect : el.compPresetBSelect;
    const s1Select = panel === 'A' ? el.compSeries1ASelect : el.compSeries1BSelect;
    const s2Select = panel === 'A' ? el.compSeries2ASelect : el.compSeries2BSelect;

    const dsKey = dsSelect.value;
    const ds = state.datasets[dsKey];
    if (!ds) return;

    // Presets
    presetSelect.innerHTML = '';
    Object.entries(ds.presets || {}).forEach(([pk, pLabel]) => {
      const opt = document.createElement('option');
      opt.value = pk;
      opt.textContent = pLabel;
      presetSelect.appendChild(opt);
    });

    // Series
    s1Select.innerHTML = '';
    s2Select.innerHTML = '<option value="">None (Autocoherence)</option>';
    Object.entries(ds.series || {}).forEach(([sk, sObj]) => {
      const lbl = typeof sObj === 'object' ? `${sObj.label} (${sObj.unit})` : sk;
      const opt1 = document.createElement('option');
      opt1.value = sk;
      opt1.textContent = lbl;
      s1Select.appendChild(opt1);

      const opt2 = document.createElement('option');
      opt2.value = sk;
      opt2.textContent = lbl;
      s2Select.appendChild(opt2);
    });

    if (ds.series['RV']) s1Select.value = 'RV';
    else if (ds.series['rv']) s1Select.value = 'rv';
    else if (Object.keys(ds.series).length > 0) s1Select.value = Object.keys(ds.series)[0];

    if (ds.series['FWHM']) s2Select.value = 'FWHM';
    else if (ds.series['delta_fwhm_sq']) s2Select.value = 'delta_fwhm_sq';
    else if (Object.keys(ds.series).length > 1) s2Select.value = Object.keys(ds.series)[1];
  }

  function populateComp1DDatasets() {
    if (!el.comp1DDatasetA || !el.comp1DDatasetB) return;
    const dsKeys = Object.keys(state.datasets);
    el.comp1DDatasetA.innerHTML = '';
    el.comp1DDatasetB.innerHTML = '';

    dsKeys.forEach(k => {
      const optA = document.createElement('option');
      optA.value = k;
      optA.textContent = state.datasets[k].name;
      el.comp1DDatasetA.appendChild(optA);

      const optB = document.createElement('option');
      optB.value = k;
      optB.textContent = state.datasets[k].name;
      el.comp1DDatasetB.appendChild(optB);
    });

    el.comp1DDatasetA.value = el.compDatasetASelect?.value || 'harpsn';
    el.comp1DDatasetB.value = el.compDatasetBSelect?.value || 'harpsn';

    updateComp1DOptions('A');
    updateComp1DOptions('B');
  }

  function updateComp1DOptions(panel, preserveSelection = false) {
    const isA = panel === 'A';
    const dsSelect = isA ? el.comp1DDatasetA : el.comp1DDatasetB;
    const presetSelect = isA ? el.comp1DPresetA : el.comp1DPresetB;
    const s1Select = isA ? el.comp1DSeries1A : el.comp1DSeries1B;
    const s2Select = isA ? el.comp1DSeries2A : el.comp1DSeries2B;

    if (!dsSelect || !presetSelect || !s1Select || !s2Select) return;

    const dsKey = dsSelect.value;
    const ds = state.datasets[dsKey];
    if (!ds) return;

    const curPreset = preserveSelection ? presetSelect.value : null;
    const curS1 = preserveSelection ? s1Select.value : null;
    const curS2 = preserveSelection ? s2Select.value : null;

    // Presets
    presetSelect.innerHTML = '';
    Object.entries(ds.presets || {}).forEach(([pk, pLabel]) => {
      const opt = document.createElement('option');
      opt.value = pk;
      opt.textContent = pLabel;
      presetSelect.appendChild(opt);
    });
    if (curPreset && ds.presets && ds.presets[curPreset]) {
      presetSelect.value = curPreset;
    } else {
      const panelPreset = isA ? el.compPresetASelect?.value : el.compPresetBSelect?.value;
      if (panelPreset && ds.presets && ds.presets[panelPreset]) {
        presetSelect.value = panelPreset;
      }
    }

    // Series
    s1Select.innerHTML = '';
    s2Select.innerHTML = '';
    const seriesKeys = Object.keys(ds.series || {});
    seriesKeys.forEach(sk => {
      const sObj = ds.series[sk];
      const lbl = typeof sObj === 'object' ? `${sObj.label} (${sObj.unit})` : sk;

      const opt1 = document.createElement('option');
      opt1.value = sk;
      opt1.textContent = lbl;
      s1Select.appendChild(opt1);

      const opt2 = document.createElement('option');
      opt2.value = sk;
      opt2.textContent = lbl;
      s2Select.appendChild(opt2);
    });

    // Default Series 1
    if (curS1 && ds.series[curS1]) {
      s1Select.value = curS1;
    } else if (ds.series['RV']) {
      s1Select.value = 'RV';
    } else if (ds.series['rv']) {
      s1Select.value = 'rv';
    } else if (ds.series['R']) {
      s1Select.value = 'R';
    } else if (seriesKeys.length > 0) {
      s1Select.value = seriesKeys[0];
    }

    // Default Series 2 (distinct from Series 1)
    if (curS2 && ds.series[curS2] && curS2 !== s1Select.value) {
      s2Select.value = curS2;
    } else if (s1Select.value !== 'FWHM' && ds.series['FWHM']) {
      s2Select.value = 'FWHM';
    } else if (s1Select.value !== 'delta_fwhm_sq' && ds.series['delta_fwhm_sq']) {
      s2Select.value = 'delta_fwhm_sq';
    } else if (s1Select.value !== 'F10_7' && ds.series['F10_7']) {
      s2Select.value = 'F10_7';
    } else {
      const otherKey = seriesKeys.find(k => k !== s1Select.value);
      if (otherKey) s2Select.value = otherKey;
    }
  }

  function ensureDistinctComp1DSeries(panel) {
    const isA = panel === 'A';
    const s1Select = isA ? el.comp1DSeries1A : el.comp1DSeries1B;
    const s2Select = isA ? el.comp1DSeries2A : el.comp1DSeries2B;
    const dsKey = (isA ? el.comp1DDatasetA : el.comp1DDatasetB)?.value;
    const ds = state.datasets[dsKey];
    if (!ds || !s1Select || !s2Select) return;

    if (s1Select.value === s2Select.value) {
      const seriesKeys = Object.keys(ds.series || {});
      const otherKey = seriesKeys.find(k => k !== s1Select.value);
      if (otherKey) {
        s2Select.value = otherKey;
      }
    }
  }

  function setComp1DParams(panel, dsKey, presetKey, s1, s2, kVal) {
    const isA = panel === 'A';
    const dsSelect = isA ? el.comp1DDatasetA : el.comp1DDatasetB;
    const presetSelect = isA ? el.comp1DPresetA : el.comp1DPresetB;
    const s1Select = isA ? el.comp1DSeries1A : el.comp1DSeries1B;
    const s2Select = isA ? el.comp1DSeries2A : el.comp1DSeries2B;
    const kInput = isA ? el.comp1DKInputA : el.comp1DKInputB;

    if (dsSelect && dsKey) {
      dsSelect.value = dsKey;
      updateComp1DOptions(panel);
    }
    if (presetSelect && presetKey) presetSelect.value = presetKey;
    if (s1Select && s1) s1Select.value = s1;
    if (s2Select && s2) s2Select.value = s2;
    if (kInput && kVal) kInput.value = kVal;
    ensureDistinctComp1DSeries(panel);
  }

  async function autocalcComp1D(panel) {
    const isA = panel === 'A';
    const dsKey = (isA ? el.comp1DDatasetA : el.comp1DDatasetB)?.value;
    const pKey = (isA ? el.comp1DPresetA : el.comp1DPresetB)?.value;
    const kInput = isA ? el.comp1DKInputA : el.comp1DKInputB;

    let kSegs = 4;
    if (dsKey === 'harpsn') {
      kSegs = 4;
    } else if (dsKey === 'omni2') {
      if (pKey === 'all_max' || pKey === 'all_min' || pKey === 'solar_maxima_all' || pKey === 'solar_minima_all') {
        kSegs = 6;
      } else {
        kSegs = 5;
      }
    } else {
      try {
        const s1Key = (isA ? el.comp1DSeries1A : el.comp1DSeries1B)?.value;
        const res = await fetch('/api/segmentation_suggest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataset: dsKey, series1: s1Key, preset: pKey, gap_threshold: 30.0, overlap: 0.5 })
        });
        const data = await res.json();
        if (data.status === 'ok' && data.k_segs) {
          kSegs = Math.min(12, Math.max(2, data.k_segs));
        }
      } catch (e) {
        console.error('Error fetching segment suggestion:', e);
      }
    }

    if (kInput) kInput.value = kSegs;
    showToast(`Panel ${panel} 1D: Set to adaptive K=${kSegs} segments.`);
    await computeComp1D(panel);
  }

  async function syncComp1DFrom2D(panel) {
    const isA = panel === 'A';
    const ds2D = isA ? el.compDatasetASelect?.value : el.compDatasetBSelect?.value;
    const preset2D = isA ? el.compPresetASelect?.value : el.compPresetBSelect?.value;
    const s1_2D = isA ? el.compSeries1ASelect?.value : el.compSeries1BSelect?.value;
    const s2_2D = isA ? el.compSeries2ASelect?.value : el.compSeries2BSelect?.value;
    const k2D = isA ? (el.compKAInput?.value || 4) : (el.compKBInput?.value || 4);

    const dsSelect = isA ? el.comp1DDatasetA : el.comp1DDatasetB;
    const presetSelect = isA ? el.comp1DPresetA : el.comp1DPresetB;
    const s1Select = isA ? el.comp1DSeries1A : el.comp1DSeries1B;
    const s2Select = isA ? el.comp1DSeries2A : el.comp1DSeries2B;
    const kInput = isA ? el.comp1DKInputA : el.comp1DKInputB;

    if (ds2D && dsSelect) dsSelect.value = ds2D;
    updateComp1DOptions(panel);

    if (preset2D && presetSelect) presetSelect.value = preset2D;
    if (s1_2D && s1Select) s1Select.value = s1_2D;
    if (s2_2D && s2_2D !== s1_2D && s2Select) {
      s2Select.value = s2_2D;
    } else {
      ensureDistinctComp1DSeries(panel);
    }
    if (kInput) kInput.value = k2D;

    showToast(`Panel ${panel} 1D: Synced with 2D Panel ${panel} setup.`);
    await computeComp1D(panel);
  }

  // Expose helpers to outer scope
  window._updateComp1DOptions = updateComp1DOptions;
  window._setComp1DParams = setComp1DParams;

  populateCompDatasets();
  populateComp1DDatasets();

  el.compDatasetASelect.addEventListener('change', () => updateCompPanelOptions('A'));
  el.compDatasetBSelect.addEventListener('change', () => updateCompPanelOptions('B'));

  if (el.comp1DDatasetA) el.comp1DDatasetA.addEventListener('change', () => { updateComp1DOptions('A'); ensureDistinctComp1DSeries('A'); });
  if (el.comp1DDatasetB) el.comp1DDatasetB.addEventListener('change', () => { updateComp1DOptions('B'); ensureDistinctComp1DSeries('B'); });
  if (el.comp1DSeries1A) el.comp1DSeries1A.addEventListener('change', () => ensureDistinctComp1DSeries('A'));
  if (el.comp1DSeries1B) el.comp1DSeries1B.addEventListener('change', () => ensureDistinctComp1DSeries('B'));
  if (el.btnComp1DAutoA) el.btnComp1DAutoA.addEventListener('click', () => autocalcComp1D('A'));
  if (el.btnComp1DAutoB) el.btnComp1DAutoB.addEventListener('click', () => autocalcComp1D('B'));
  if (el.btnComp1DComputeA) el.btnComp1DComputeA.addEventListener('click', () => computeComp1D('A'));
  if (el.btnComp1DComputeB) el.btnComp1DComputeB.addEventListener('click', () => computeComp1D('B'));
  if (el.btnSyncComp1DA) el.btnSyncComp1DA.addEventListener('click', () => syncComp1DFrom2D('A'));
  if (el.btnSyncComp1DB) el.btnSyncComp1DB.addEventListener('click', () => syncComp1DFrom2D('B'));

  [el.comp1DKInputA, el.comp1DKInputB].forEach((inp, idx) => {
    if (!inp) return;
    const panel = idx === 0 ? 'A' : 'B';
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        computeComp1D(panel);
      }
    });
  });

  if (el.compPresetSelector) {
    el.compPresetSelector.addEventListener('change', async (e) => {
      applyComparisonPreset(e.target.value);
      await runComparisonComputation();
    });
  }

  function setCompKA(val) {
    const k = Math.max(2, parseInt(val, 10) || 4);
    state.compKA = k;
    if (el.compKAInput) el.compKAInput.value = k;
    if (el.compKASlider) el.compKASlider.value = Math.min(15, k);
    if (el.quickKAInput) el.quickKAInput.value = k;
    document.querySelectorAll('.chip-ka').forEach(chip => {
      chip.classList.toggle('active', parseInt(chip.dataset.ka, 10) === k);
    });
  }

  function setCompKB(val) {
    const k = Math.max(2, parseInt(val, 10) || 4);
    state.compKB = k;
    if (el.compKBInput) el.compKBInput.value = k;
    if (el.compKBSlider) el.compKBSlider.value = Math.min(15, k);
    if (el.quickKBInput) el.quickKBInput.value = k;
    document.querySelectorAll('.chip-kb').forEach(chip => {
      chip.classList.toggle('active', parseInt(chip.dataset.kb, 10) === k);
    });
  }

  async function autocalcCompPanel(panel) {
    showToast(`Autocalculating adaptive segments for Panel ${panel}...`);
    try {
      const isA = panel === 'A';
      const dsKey = isA ? el.compDatasetASelect.value : el.compDatasetBSelect.value;
      const pKey = isA ? el.compPresetASelect.value : el.compPresetBSelect.value;

      let kSegs = 4;
      if (dsKey === 'harpsn') {
        kSegs = 4;
      } else if (dsKey === 'omni2') {
        if (pKey === 'all_max' || pKey === 'all_min' || pKey === 'solar_maxima_all' || pKey === 'solar_minima_all') {
          kSegs = 6;
        } else {
          kSegs = 5;
        }
      } else {
        const s1Key = isA ? el.compSeries1ASelect.value : el.compSeries1BSelect.value;
        const res = await fetch('/api/segmentation_suggest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataset: dsKey, series1: s1Key, preset: pKey, gap_threshold: 30.0, overlap: 0.5 })
        });
        const data = await res.json();
        if (data.status === 'ok' && data.k_segs) {
          kSegs = Math.min(12, Math.max(2, data.k_segs));
        }
      }

      if (isA) {
        setCompKA(kSegs);
        if (el.compAK) el.compAK.textContent = kSegs;
      } else {
        setCompKB(kSegs);
        if (el.compBK) el.compBK.textContent = kSegs;
      }
      showToast(`Panel ${panel}: Set to optimal adaptive K=${kSegs} segments.`);
      await runComparisonComputation();
    } catch (err) {
      console.error(`Error autocalculating segments for panel ${panel}:`, err);
      showToast(`Failed to autocalculate segments for Panel ${panel}.`);
    }
  }

  function applyComparisonPreset(presetKey) {
    if (presetKey === 'solar_min_max_rv') {
      el.compDatasetASelect.value = 'harpsn';
      updateCompPanelOptions('A');
      el.compPresetASelect.value = 'cycle_min_3yr';
      el.compSeries1ASelect.value = 'RV';
      el.compSeries2ASelect.value = '';
      setCompKA(4);

      el.compDatasetBSelect.value = 'harpsn';
      updateCompPanelOptions('B');
      el.compPresetBSelect.value = 'cycle_max_3yr';
      el.compSeries1BSelect.value = 'RV';
      el.compSeries2BSelect.value = '';
      setCompKB(4);

      el.compFminInput.value = 0.0;
      el.compFmaxInput.value = 0.10;
      el.compTargetF2Input.value = (1.0 / 27.28).toFixed(5);

      setComp1DParams('A', 'harpsn', 'cycle_min_3yr', 'RV', 'FWHM', 4);
      setComp1DParams('B', 'harpsn', 'cycle_max_3yr', 'RV', 'FWHM', 4);
    } else if (presetKey === 'solar_min_max_fwhm_auto') {
      el.compDatasetASelect.value = 'harpsn';
      updateCompPanelOptions('A');
      el.compPresetASelect.value = 'cycle_min_3yr';
      el.compSeries1ASelect.value = 'FWHM';
      el.compSeries2ASelect.value = '';
      setCompKA(4);

      el.compDatasetBSelect.value = 'harpsn';
      updateCompPanelOptions('B');
      el.compPresetBSelect.value = 'cycle_max_3yr';
      el.compSeries1BSelect.value = 'FWHM';
      el.compSeries2BSelect.value = '';
      setCompKB(4);

      el.compFminInput.value = 0.0;
      el.compFmaxInput.value = 0.10;
      el.compTargetF2Input.value = (1.0 / 27.28).toFixed(5);

      setComp1DParams('A', 'harpsn', 'cycle_min_3yr', 'RV', 'FWHM', 4);
      setComp1DParams('B', 'harpsn', 'cycle_max_3yr', 'RV', 'FWHM', 4);
    } else if (presetKey === 'omni_min_max_sunspots') {
      el.compDatasetASelect.value = 'omni2';
      updateCompPanelOptions('A');
      el.compPresetASelect.value = 'all_min';
      el.compSeries1ASelect.value = 'R';
      el.compSeries2ASelect.value = '';
      setCompKA(6);

      el.compDatasetBSelect.value = 'omni2';
      updateCompPanelOptions('B');
      el.compPresetBSelect.value = 'all_max';
      el.compSeries1BSelect.value = 'R';
      el.compSeries2BSelect.value = '';
      setCompKB(6);

      el.compFminInput.value = 0.01;
      el.compFmaxInput.value = 0.08;
      el.compTargetF2Input.value = (1.0 / 27.28).toFixed(5);

      setComp1DParams('A', 'omni2', 'all_min', 'R', 'F10_7', 6);
      setComp1DParams('B', 'omni2', 'all_max', 'R', 'F10_7', 6);
    } else if (presetKey === 'omni_min_max_f107') {
      el.compDatasetASelect.value = 'omni2';
      updateCompPanelOptions('A');
      el.compPresetASelect.value = 'all_min';
      el.compSeries1ASelect.value = 'F10_7';
      el.compSeries2ASelect.value = '';
      setCompKA(6);

      el.compDatasetBSelect.value = 'omni2';
      updateCompPanelOptions('B');
      el.compPresetBSelect.value = 'all_max';
      el.compSeries1BSelect.value = 'F10_7';
      el.compSeries2BSelect.value = '';
      setCompKB(6);

      el.compFminInput.value = 0.01;
      el.compFmaxInput.value = 0.08;
      el.compTargetF2Input.value = (1.0 / 27.28).toFixed(5);

      setComp1DParams('A', 'omni2', 'all_min', 'R', 'F10_7', 6);
      setComp1DParams('B', 'omni2', 'all_max', 'R', 'F10_7', 6);
    } else if (presetKey === 'omni_full_k5') {
      el.compDatasetASelect.value = 'omni2';
      updateCompPanelOptions('A');
      el.compPresetASelect.value = 'full';
      el.compSeries1ASelect.value = 'R';
      el.compSeries2ASelect.value = '';
      setCompKA(5);

      el.compDatasetBSelect.value = 'omni2';
      updateCompPanelOptions('B');
      el.compPresetBSelect.value = 'full';
      el.compSeries1BSelect.value = 'R';
      el.compSeries2BSelect.value = '';
      setCompKB(3);

      el.compFminInput.value = 0.01;
      el.compFmaxInput.value = 0.08;
      el.compTargetF2Input.value = (1.0 / 27.28).toFixed(5);

      setComp1DParams('A', 'omni2', 'full', 'R', 'F10_7', 5);
      setComp1DParams('B', 'omni2', 'full', 'R', 'F10_7', 3);
    } else if (presetKey === 'segmentation_compare_k4_vs_k2') {
      el.compDatasetASelect.value = 'harpsn';
      updateCompPanelOptions('A');
      el.compPresetASelect.value = '10yr';
      el.compSeries1ASelect.value = 'RV';
      el.compSeries2ASelect.value = '';
      setCompKA(4);

      el.compDatasetBSelect.value = 'harpsn';
      updateCompPanelOptions('B');
      el.compPresetBSelect.value = '10yr';
      el.compSeries1BSelect.value = 'RV';
      el.compSeries2BSelect.value = '';
      setCompKB(2);

      el.compFminInput.value = 0.0;
      el.compFmaxInput.value = 0.10;
      el.compTargetF2Input.value = (1.0 / 27.28).toFixed(5);

      setComp1DParams('A', 'harpsn', '10yr', 'RV', 'FWHM', 4);
      setComp1DParams('B', 'harpsn', '10yr', 'RV', 'FWHM', 2);
    } else if (presetKey === 'solar_min_max_cross') {
      el.compDatasetASelect.value = 'harpsn';
      updateCompPanelOptions('A');
      el.compPresetASelect.value = 'cycle_min_3yr';
      el.compSeries1ASelect.value = 'RV';
      el.compSeries2ASelect.value = 'FWHM';
      setCompKA(4);

      el.compDatasetBSelect.value = 'harpsn';
      updateCompPanelOptions('B');
      el.compPresetBSelect.value = 'cycle_max_3yr';
      el.compSeries1BSelect.value = 'RV';
      el.compSeries2BSelect.value = 'FWHM';
      setCompKB(4);

      el.compFminInput.value = 0.0;
      el.compFmaxInput.value = 0.10;
      el.compTargetF2Input.value = (1.0 / 27.28).toFixed(5);

      setComp1DParams('A', 'harpsn', 'cycle_min_3yr', 'RV', 'FWHM', 4);
      setComp1DParams('B', 'harpsn', 'cycle_max_3yr', 'RV', 'FWHM', 4);
    }
  }

  // Helper functions for updating K and immediately recomputing
  function handleCompKAUpdate(val) {
    setCompKA(val);
    runComparisonComputation();
  }
  function handleCompKBUpdate(val) {
    setCompKB(val);
    runComparisonComputation();
  }

  // Panel A K event listeners (sync across sidebar, timeline, and 1D coherence panel)
  [el.compKAInput, el.quickKAInput].forEach(input => {
    if (!input) return;
    input.addEventListener('change', (e) => handleCompKAUpdate(e.target.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleCompKAUpdate(e.target.value);
      }
    });
  });
  if (el.compKASlider) {
    el.compKASlider.addEventListener('input', (e) => setCompKA(e.target.value));
    el.compKASlider.addEventListener('change', (e) => handleCompKAUpdate(e.target.value));
  }
  document.querySelectorAll('.chip-ka').forEach(chip => {
    chip.addEventListener('click', () => {
      setCompKA(chip.dataset.ka);
      runComparisonComputation();
    });
  });
  if (el.btnAutocalcCompA) el.btnAutocalcCompA.addEventListener('click', () => autocalcCompPanel('A'));
  if (el.btnQuickAutocalcA) el.btnQuickAutocalcA.addEventListener('click', () => autocalcCompPanel('A'));

  if (el.compSegStrategyA) {
    el.compSegStrategyA.querySelectorAll('.seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        el.compSegStrategyA.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.compSegModeA = btn.dataset.compModeA;
        runComparisonComputation();
      });
    });
  }

  // Panel B K event listeners (sync across sidebar and timeline)
  [el.compKBInput, el.quickKBInput].forEach(input => {
    if (!input) return;
    input.addEventListener('change', (e) => handleCompKBUpdate(e.target.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleCompKBUpdate(e.target.value);
      }
    });
  });
  if (el.compKBSlider) {
    el.compKBSlider.addEventListener('input', (e) => setCompKB(e.target.value));
    el.compKBSlider.addEventListener('change', (e) => handleCompKBUpdate(e.target.value));
  }
  document.querySelectorAll('.chip-kb').forEach(chip => {
    chip.addEventListener('click', () => {
      setCompKB(chip.dataset.kb);
      runComparisonComputation();
    });
  });
  if (el.btnAutocalcCompB) el.btnAutocalcCompB.addEventListener('click', () => autocalcCompPanel('B'));
  if (el.btnQuickAutocalcB) el.btnQuickAutocalcB.addEventListener('click', () => autocalcCompPanel('B'));

  if (el.compSegStrategyB) {
    el.compSegStrategyB.querySelectorAll('.seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        el.compSegStrategyB.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.compSegModeB = btn.dataset.compModeB;
        runComparisonComputation();
      });
    });
  }

  if (el.btnToggleCompTimeline && el.compTimelineBody) {
    el.btnToggleCompTimeline.addEventListener('click', () => {
      const isHidden = el.compTimelineBody.style.display === 'none';
      el.compTimelineBody.style.display = isHidden ? 'grid' : 'none';
      el.btnToggleCompTimeline.textContent = isHidden ? 'Collapse Timelines' : 'Expand Timelines';
      if (isHidden) {
        if (el.plotCompTimelineA) Plotly.Plots.resize(el.plotCompTimelineA);
        if (el.plotCompTimelineB) Plotly.Plots.resize(el.plotCompTimelineB);
      }
    });
  }

  applyComparisonPreset('solar_min_max_rv');

  if (el.compTaperControl) {
    el.compTaperControl.querySelectorAll('.seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        el.compTaperControl.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.compTaper = btn.dataset.compTaper;
      });
    });
  }

  if (el.compFapControl) {
    el.compFapControl.querySelectorAll('.seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        el.compFapControl.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.compFap = btn.dataset.compFap;
        if (el.compMcContainer) {
          el.compMcContainer.style.display = state.compFap === 'rednoise' ? 'block' : 'none';
        }
      });
    });
  }

  function toggleCompFal(active) {
    state.showCompFalContours = active;
    const txt = state.showCompFalContours ? 'FAL Contours: ON' : 'FAL Contours: OFF';
    if (el.btnToggleCompFalA) {
      el.btnToggleCompFalA.textContent = txt;
      el.btnToggleCompFalA.classList.toggle('active', state.showCompFalContours);
    }
    if (el.btnToggleCompFalB) {
      el.btnToggleCompFalB.textContent = txt;
      el.btnToggleCompFalB.classList.toggle('active', state.showCompFalContours);
    }
    if (state.comparisonData) {
      const th = getThemeColors();
      const { zmin, zmax } = getContrastRange();
      const panelA = state.comparisonData.panel_a;
      const panelB = state.comparisonData.panel_b;
      const comp = state.comparisonData.comparison;
      const targetF2 = comp.shared_horizontal_cut.target_f2 || (1.0 / panelA.coherence.p_rot);
      renderSingleCompMap(el.plotCompMapA, panelA.coherence, comp.label_a, '#00E676', targetF2, th, zmin, zmax);
      renderSingleCompMap(el.plotCompMapB, panelB.coherence, comp.label_b, '#FF9100', targetF2, th, zmin, zmax);
    }
  }

  if (el.btnToggleCompFalA) {
    el.btnToggleCompFalA.addEventListener('click', () => toggleCompFal(!state.showCompFalContours));
  }
  if (el.btnToggleCompFalB) {
    el.btnToggleCompFalB.addEventListener('click', () => toggleCompFal(!state.showCompFalContours));
  }

  if (el.compRightViewToggle) {
    el.compRightViewToggle.querySelectorAll('.seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        el.compRightViewToggle.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.compRightView = btn.dataset.compRight;
        renderComparisonRightView();
      });
    });
  }

  if (el.btnRunComparison) {
    el.btnRunComparison.addEventListener('click', runComparisonComputation);
  }
  if (el.btnExportCompPNG) {
    el.btnExportCompPNG.addEventListener('click', exportComparisonPNG);
  }
  if (el.btnExportCompCSV) {
    el.btnExportCompCSV.addEventListener('click', exportComparisonCSV);
  }

  if (el.btnResetZoomCompA) {
    el.btnResetZoomCompA.addEventListener('click', () => {
      if (el.plotCompMapA) Plotly.relayout(el.plotCompMapA, { 'xaxis.autorange': true, 'yaxis.autorange': true });
    });
  }
  if (el.btnResetZoomCompB) {
    el.btnResetZoomCompB.addEventListener('click', () => {
      if (el.plotCompMapB) Plotly.relayout(el.plotCompMapB, { 'xaxis.autorange': true, 'yaxis.autorange': true });
    });
  }
  if (el.btnResetZoomCompDelta) {
    el.btnResetZoomCompDelta.addEventListener('click', () => {
      if (el.plotCompMapDelta) Plotly.relayout(el.plotCompMapDelta, { 'xaxis.autorange': true, 'yaxis.autorange': true });
    });
  }
  if (el.btnResetZoomCompHoriz) {
    el.btnResetZoomCompHoriz.addEventListener('click', () => {
      if (el.plotCompHorizSlice) Plotly.relayout(el.plotCompHorizSlice, { 'xaxis.autorange': true, 'yaxis.autorange': true });
    });
  }
  if (el.btnResetZoomCompAntiDiag) {
    el.btnResetZoomCompAntiDiag.addEventListener('click', () => {
      if (el.plotCompAntiDiagSlice) Plotly.relayout(el.plotCompAntiDiagSlice, { 'xaxis.autorange': true, 'yaxis.autorange': true });
    });
  }
  if (el.btnResetZoomComp1DCohA) {
    el.btnResetZoomComp1DCohA.addEventListener('click', () => {
      if (el.plotComp1DCohA) Plotly.relayout(el.plotComp1DCohA, { 'xaxis.autorange': true, 'yaxis.autorange': true });
    });
  }
  if (el.btnResetZoomComp1DCohB) {
    el.btnResetZoomComp1DCohB.addEventListener('click', () => {
      if (el.plotComp1DCohB) Plotly.relayout(el.plotComp1DCohB, { 'xaxis.autorange': true, 'yaxis.autorange': true });
    });
  }

  if (el.btnCompCutRot) {
    el.btnCompCutRot.addEventListener('click', () => setCompHorizontalCutPreset(false));
  }
  if (el.btnCompCut2Rot) {
    el.btnCompCut2Rot.addEventListener('click', () => setCompHorizontalCutPreset(true));
  }
  if (el.btnCompPresetRot) {
    el.btnCompPresetRot.addEventListener('click', () => setCompHorizontalCutPreset(false));
  }
  if (el.btnCompPreset2Rot) {
    el.btnCompPreset2Rot.addEventListener('click', () => setCompHorizontalCutPreset(true));
  }
  if (el.compTargetF2Input) {
    el.compTargetF2Input.addEventListener('change', (e) => {
      const f2 = parseFloat(e.target.value);
      if (f2 > 0) {
        updateCompCutPresetButtons(f2);
        handleComparisonMapClick(f2, f2);
      }
    });
    el.compTargetF2Input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const f2 = parseFloat(e.target.value);
        if (f2 > 0) {
          updateCompCutPresetButtons(f2);
          handleComparisonMapClick(f2, f2);
        }
      }
    });
  }
}

function updateCompCutPresetButtons(targetF2) {
  const pRot = state.comparisonData?.panel_a?.coherence?.p_rot || 27.28;
  const fRot = 1.0 / pRot;
  const f2Rot = 2.0 / pRot;
  const tol = 2e-4;

  const isRot = Math.abs(targetF2 - fRot) < tol;
  const is2Rot = Math.abs(targetF2 - f2Rot) < tol;

  if (el.btnCompPresetRot) el.btnCompPresetRot.classList.toggle('active', isRot);
  if (el.btnCompPreset2Rot) el.btnCompPreset2Rot.classList.toggle('active', is2Rot);
  if (el.btnCompCutRot) el.btnCompCutRot.classList.toggle('active', isRot);
  if (el.btnCompCut2Rot) el.btnCompCut2Rot.classList.toggle('active', is2Rot);
}

function setCompHorizontalCutPreset(isHarmonic = false) {
  const pRot = state.comparisonData?.panel_a?.coherence?.p_rot || 27.28;
  const f2 = isHarmonic ? (2.0 / pRot) : (1.0 / pRot);
  if (el.compTargetF2Input) el.compTargetF2Input.value = f2.toFixed(5);
  updateCompCutPresetButtons(f2);
  handleComparisonMapClick(f2, f2);
}

async function runComparisonComputation() {
  try {
    if (el.btnRunComparison) {
      el.btnRunComparison.classList.add('loading');
      el.btnRunComparison.querySelector('.btn-text').textContent = 'Computing Comparison...';
    }

    const dsA = el.compDatasetASelect.value;
    const dsB = el.compDatasetBSelect.value;
    const pA = el.compPresetASelect.value;
    const pB = el.compPresetBSelect.value;

    const s1A = el.compSeries1ASelect.value;
    const s2A = el.compSeries2ASelect.value;
    const seriesLabelA = s2A ? `${s1A} × ${s2A}` : `${s1A} (Autocoherence)`;
    const labelA = `${state.datasets[dsA]?.name || dsA} (${el.compPresetASelect.options[el.compPresetASelect.selectedIndex]?.text || pA}) [${seriesLabelA}]`;

    const s1B = el.compSeries1BSelect.value;
    const s2B = el.compSeries2BSelect.value;
    const seriesLabelB = s2B ? `${s1B} × ${s2B}` : `${s1B} (Autocoherence)`;
    const labelB = `${state.datasets[dsB]?.name || dsB} (${el.compPresetBSelect.options[el.compPresetBSelect.selectedIndex]?.text || pB}) [${seriesLabelB}]`;

    const rawFmin = parseFloat(el.compFminInput?.value);
    const rawFmax = parseFloat(el.compFmaxInput?.value);
    const fminComp = !isNaN(rawFmin) ? rawFmin : 0.0;
    const fmaxComp = !isNaN(rawFmax) ? rawFmax : 0.10;

    const payload = {
      panel_a: {
        dataset: dsA,
        series1: s1A,
        series2: s2A || null,
        mode: s2A ? 'cross' : 'auto',
        preset: pA,
        seg_mode: state.compSegModeA || 'adaptive',
        k_segments: parseInt(el.compKAInput?.value || 4, 10),
        label: labelA
      },
      panel_b: {
        dataset: dsB,
        series1: s1B,
        series2: s2B || null,
        mode: s2B ? 'cross' : 'auto',
        preset: pB,
        seg_mode: state.compSegModeB || 'adaptive',
        k_segments: parseInt(el.compKBInput?.value || 4, 10),
        label: labelB
      },
      shared: {
        fmin: fminComp,
        fmax: fmaxComp,
        taper: state.compTaper || 'None',
        fap_type: state.compFap || 'analytical',
        n_mc: parseInt(el.compMcInput?.value || 50, 10),
        horizontal_target: parseFloat(el.compTargetF2Input.value) || (1.0 / 27.28)
      }
    };

    const res = await fetch('/api/compute_comparison', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (data.status === 'ok') {
      state.comparisonData = data.comparison_data;
      renderComparisonView();
      // Plot independent 1D Welch coherence curves side-by-side
      computeComp1D('A');
      computeComp1D('B');
      showToast('Comparison computed successfully!');
    } else {
      showToast(`Comparison Error: ${data.message}`);
    }
  } catch (err) {
    console.error('Comparison error:', err);
    showToast('Failed to run comparison.');
  } finally {
    if (el.btnRunComparison) {
      el.btnRunComparison.classList.remove('loading');
      el.btnRunComparison.querySelector('.btn-text').textContent = 'Run Comparison Analysis';
    }
  }
}

function renderComparisonView() {
  if (!state.comparisonData) return;
  const comp = state.comparisonData.comparison;
  const panelA = state.comparisonData.panel_a;
  const panelB = state.comparisonData.panel_b;
  const th = getThemeColors();

  // Metrics Banner
  if (el.compStatNA) el.compStatNA.textContent = panelA.dataset_info.n_pts;
  if (el.compStatNeffA) el.compStatNeffA.textContent = panelA.coherence.neff.toFixed(1);
  if (el.compStat2RA) el.compStat2RA.textContent = `${panelA.coherence.bw_2R.toFixed(4)} d⁻¹`;
  if (el.compStatProtA) el.compStatProtA.textContent = `${comp.shared_horizontal_cut.peak_a.P.toFixed(2)} d`;
  if (el.compMetricLabelA) el.compMetricLabelA.textContent = comp.label_a;

  if (el.compStatNB) el.compStatNB.textContent = panelB.dataset_info.n_pts;
  if (el.compStatNeffB) el.compStatNeffB.textContent = panelB.coherence.neff.toFixed(1);
  if (el.compStat2RB) el.compStat2RB.textContent = `${panelB.coherence.bw_2R.toFixed(4)} d⁻¹`;
  if (el.compStatProtB) el.compStatProtB.textContent = `${comp.shared_horizontal_cut.peak_b.P.toFixed(2)} d`;
  if (el.compMetricLabelB) el.compMetricLabelB.textContent = comp.label_b;

  if (el.compBeatPeriodVal) {
    el.compBeatPeriodVal.textContent = comp.shared_horizontal_cut.p_beat
      ? `P_beat: ${comp.shared_horizontal_cut.p_beat.toFixed(1)} days`
      : 'P_beat: None';
  }
  if (el.compBeatFreqVal) {
    el.compBeatFreqVal.textContent = `Δf = ${comp.shared_horizontal_cut.delta_f.toFixed(5)} d⁻¹`;
  }

  // Update live segment badges in Panel A and Panel B
  if (el.compANpts) el.compANpts.textContent = panelA.dataset_info.n_pts;
  if (el.compAK) el.compAK.textContent = panelA.coherence.segments ? panelA.coherence.segments.length : (panelA.coherence.n_segs || '—');
  if (el.compANeff) el.compANeff.textContent = panelA.coherence.neff.toFixed(1);
  if (el.compA2R) el.compA2R.textContent = `${panelA.coherence.bw_2R.toFixed(4)} d⁻¹`;

  if (el.compBNpts) el.compBNpts.textContent = panelB.dataset_info.n_pts;
  if (el.compBK) el.compBK.textContent = panelB.coherence.segments ? panelB.coherence.segments.length : (panelB.coherence.n_segs || '—');
  if (el.compBNeff) el.compBNeff.textContent = panelB.coherence.neff.toFixed(1);
  if (el.compB2R) el.compB2R.textContent = `${panelB.coherence.bw_2R.toFixed(4)} d⁻¹`;

  try {
    renderCompTimelines();
  } catch (err) {
    console.error('[Comparison] Error rendering timelines:', err);
  }

  const { zmin, zmax } = getContrastRange();

  renderSingleCompMap(el.plotCompMapA, panelA.coherence, comp.label_a, '#00E676', comp.shared_horizontal_cut.target_f2, th, zmin, zmax);
  renderSingleCompMap(el.plotCompMapB, panelB.coherence, comp.label_b, '#FF9100', comp.shared_horizontal_cut.target_f2, th, zmin, zmax);
  renderCompDeltaMap(el.plotCompMapDelta, comp, th, comp.shared_horizontal_cut.target_f2);
  renderCompHorizontalCut(comp.shared_horizontal_cut, comp.label_a, comp.label_b, th, Math.max(panelA.coherence.bw_2R, panelB.coherence.bw_2R));
  renderCompAntiDiagonalCut(comp.shared_antidiagonal_cut, comp.label_a, comp.label_b, th);
  
  const initF1 = comp.shared_horizontal_cut.peak_a?.f || (1.0 / panelA.coherence.p_rot);
  const initF2 = comp.shared_horizontal_cut.target_f2 || (1.0 / panelA.coherence.p_rot);
  renderCompNodeMetrics(initF1, initF2);
  renderComp1DPanels();

  const pRotA = panelA.coherence?.p_rot || 27.28;
  if (el.btnCompPresetRot) {
    el.btnCompPresetRot.textContent = `f_rot (${pRotA.toFixed(1)} d)`;
  }
  if (el.btnCompPreset2Rot) {
    el.btnCompPreset2Rot.textContent = `2×f_rot (${(pRotA / 2.0).toFixed(1)} d)`;
  }
  updateCompCutPresetButtons(initF2);
}

function renderCompTimelines() {
  if (!el.plotCompTimelineA && !el.plotCompTimelineB) return;
  if (!state.comparisonData) return;
  const panelA = state.comparisonData.panel_a;
  const panelB = state.comparisonData.panel_b;
  const comp = state.comparisonData.comparison;
  const th = getThemeColors();

  const segColors = [
    '#1976D2', '#388E3C', '#D32F2F', '#F57C00', '#7B1FA2',
    '#0097A7', '#C2185B', '#FFA000', '#00796B', '#512DA8'
  ];

  function drawTimeline(container, panel, label, colorHex, titleEl, quickInputEl) {
    if (!container || !panel) return;
    const tl = panel.timeline || panel.welch_1d;
    const coh = panel.coherence;
    const nSegs = tl?.segments ? tl.segments.length : (coh.segments ? coh.segments.length : (coh.n_segs || 0));
    if (titleEl) {
      titleEl.textContent = `${label} (${panel.dataset_info.n_pts} pts, K=${nSegs}, 2ℛ=${coh.bw_2R.toFixed(4)} d⁻¹)`;
    }
    if (quickInputEl && nSegs > 0) {
      quickInputEl.value = nSegs;
    }

    if (!tl || !tl.time || tl.time.length === 0) {
      container.innerHTML = '<span style="font-size:11px;color:var(--text-muted);padding:8px;">Timeline observations unavailable</span>';
      return;
    }

    const t = tl.time;
    const s1 = tl.s1;
    const s1Label = tl.s1_label || panel.welch_1d?.series1_label || 'Observations';
    const s1Unit = tl.s1_unit ? ` (${tl.s1_unit})` : '';
    const segs = tl.segments || (coh.segments ? coh.segments.map((s, idx) => ({
      seg_id: idx + 1,
      start_idx: s[0],
      end_idx: s[1],
      t_start: t[s[0]],
      t_end: t[Math.min(t.length - 1, s[1] - 1)],
      n_pts: s[1] - s[0],
      color: segColors[idx % segColors.length]
    })) : []);

    // Performance optimization: stride scatter points for high-density datasets (e.g. OMNI2 > 3000 pts)
    const stride = t.length > 3000 ? Math.ceil(t.length / 3000) : 1;
    const tDisp = [];
    const s1Disp = [];
    const hoverTexts = [];
    for (let i = 0; i < t.length; i += stride) {
      const tv = t[i];
      const sv = s1[i];
      tDisp.push(tv);
      s1Disp.push(sv);
      hoverTexts.push((tv !== null && sv !== null && !isNaN(sv)) ? `Time: ${tv.toFixed(2)} BJD<br>${s1Label}: ${sv.toFixed(2)}` : '');
    }

    const traceData = {
      x: tDisp,
      y: s1Disp,
      type: 'scatter',
      mode: 'markers',
      name: `${s1Label}`,
      marker: { color: th.isLight ? '#1E293B' : '#60A5FA', size: 3.5, opacity: 0.65 },
      hoverinfo: 'text',
      text: hoverTexts
    };

    const shapes = [];
    const annotations = [];
    let yMin = Infinity;
    let yMax = -Infinity;
    for (let i = 0; i < s1.length; i++) {
      const v = s1[i];
      if (v !== null && !isNaN(v)) {
        if (v < yMin) yMin = v;
        if (v > yMax) yMax = v;
      }
    }
    if (yMin === Infinity) { yMin = 0; yMax = 1; }
    const yMargin = (yMax - yMin) * 0.15 || 1.0;

    segs.forEach((s, idx) => {
      const tStart = s.t_start !== undefined ? s.t_start : (s.start_idx !== undefined ? t[s.start_idx] : t[0]);
      const tEnd = s.t_end !== undefined ? s.t_end : (s.end_idx !== undefined ? t[Math.min(t.length - 1, s.end_idx - 1)] : t[t.length - 1]);
      const c = s.color || segColors[idx % segColors.length];

      shapes.push({
        type: 'rect',
        xref: 'x',
        yref: 'y',
        x0: tStart,
        x1: tEnd,
        y0: yMin - yMargin,
        y1: yMax + yMargin,
        fillcolor: c,
        opacity: 0.22,
        line: { color: c, width: 1.2 }
      });

      const tMid = 0.5 * (tStart + tEnd);
      const yPos = yMax - (0.05 + 0.12 * (idx % 2)) * (yMax - yMin);
      const nPts = s.n_pts !== undefined ? s.n_pts : (s.end_idx - s.start_idx);
      annotations.push({
        x: tMid,
        y: yPos,
        text: `<b>Seg ${s.seg_id || idx + 1} (N=${nPts})</b>`,
        showarrow: false,
        font: { color: c, size: 10.5 }
      });
    });

    const layout = {
      margin: { l: 55, r: 15, t: 20, b: 35 },
      paper_bgcolor: th.paperBg,
      plot_bgcolor: th.plotBg,
      xaxis: {
        title: { text: 'Time (BJD)', font: { color: th.titleColor, size: 10 } },
        tickfont: { color: th.tickColor, size: 9 },
        gridcolor: th.gridColor,
        showline: true,
        linecolor: th.axisLineColor,
        linewidth: 1.2,
        mirror: true
      },
      yaxis: {
        title: { text: `${s1Label}${s1Unit}`, font: { color: th.titleColor, size: 10 } },
        tickfont: { color: th.tickColor, size: 9 },
        gridcolor: th.gridColor,
        showline: true,
        linecolor: th.axisLineColor,
        linewidth: 1.2,
        mirror: true,
        range: [yMin - yMargin, yMax + yMargin]
      },
      shapes: shapes,
      annotations: annotations,
      showlegend: false
    };

    Plotly.react(container, [traceData], layout, { responsive: true, displayModeBar: false });
  }

  drawTimeline(el.plotCompTimelineA, panelA, comp.label_a, '#00E676', el.lblCompTimelineA, el.quickKAInput);
  drawTimeline(el.plotCompTimelineB, panelB, comp.label_b, '#FF9100', el.lblCompTimelineB, el.quickKBInput);
}

async function handleComparisonMapClick(f1, f2) {
  if (!state.comparisonData) return;
  state.compSelectedF1 = f1;
  state.compSelectedF2 = f2;
  if (el.compTargetF2Input) el.compTargetF2Input.value = f2.toFixed(5);
  updateCompCutPresetButtons(f2);

  const th = getThemeColors();
  const { zmin, zmax } = getContrastRange();
  const panelA = state.comparisonData.panel_a;
  const panelB = state.comparisonData.panel_b;
  const comp = state.comparisonData.comparison;

  // Re-extract slice via backend endpoint
  try {
    const res = await fetch('/api/extract_comparison_slice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_f2: f2 })
    });
    const data = await res.json();
    if (data.status === 'ok') {
      comp.shared_horizontal_cut = data.slice;
      if (data.antidiagonal_slice) {
        comp.shared_antidiagonal_cut = data.antidiagonal_slice;
      }
    }
  } catch (err) {
    console.warn('[Comparison] Slice extraction error:', err);
  }

  const hCut = comp.shared_horizontal_cut;
  if (el.compBeatPeriodVal) {
    el.compBeatPeriodVal.textContent = hCut.p_beat
      ? `P_beat: ${hCut.p_beat.toFixed(1)} days`
      : 'P_beat: None';
  }
  if (el.compBeatFreqVal) {
    el.compBeatFreqVal.textContent = `Δf = ${hCut.delta_f.toFixed(5)} d⁻¹`;
  }

  if (el.titleCompHoriz) {
    el.titleCompHoriz.textContent = `Linked Horizontal Slices z(f₁ | f₂ = ${f2.toFixed(5)} d⁻¹, P₂ = ${(1.0 / f2).toFixed(2)} d)`;
  }

  // Synchronously update both Map A, Map B, and Delta crosshairs & horizontal cut lines
  renderSingleCompMap(el.plotCompMapA, panelA.coherence, comp.label_a, '#00E676', f2, th, zmin, zmax);
  renderSingleCompMap(el.plotCompMapB, panelB.coherence, comp.label_b, '#FF9100', f2, th, zmin, zmax);
  renderCompDeltaMap(el.plotCompMapDelta, comp, th, f2);
  renderCompHorizontalCut(hCut, comp.label_a, comp.label_b, th, Math.max(panelA.coherence.bw_2R, panelB.coherence.bw_2R));
  renderCompAntiDiagonalCut(comp.shared_antidiagonal_cut, comp.label_a, comp.label_b, th);
  renderCompNodeMetrics(f1, f2);

  const p1 = (1.0 / f1).toFixed(2);
  const p2 = (1.0 / f2).toFixed(2);
  showToast(`Mapped across both matrices: f₁ = ${f1.toFixed(4)} d⁻¹ (${p1} d), f₂ = ${f2.toFixed(4)} d⁻¹ (${p2} d)`);
}

function renderSingleCompMap(container, coh, label, highlightColor, targetF2, th, zmin, zmax) {
  if (!container || !coh) return;
  const fGrid = coh.f_grid;
  const zMat = coh.z_matrix;
  const fRot = 1.0 / coh.p_rot;
  const fMin = fGrid[0];
  const fMax = fGrid[fGrid.length - 1];

  let displayZ = zMat;
  if (state.maskDiagonal) {
    const factor = state.maskDiagonalWidthFactor || 1.0;
    const maskHalfWidth = (coh.bw_2R || 0.005) * factor * 0.5;
    displayZ = zMat.map((row, i) => {
      const f2 = fGrid[i];
      return row.map((val, j) => {
        const f1 = fGrid[j];
        if (Math.abs(f1 - f2) <= maskHalfWidth) return null;
        return val;
      });
    });
  }

  let effectiveZmin = zmin;
  let effectiveZmax = zmax;
  if (state.maskDiagonal) {
    const dynamicRange = getContrastRange(displayZ);
    effectiveZmin = dynamicRange.zmin;
    effectiveZmax = dynamicRange.zmax;
  }

  const traceHeatmap = {
    x: fGrid,
    y: fGrid,
    z: displayZ,
    type: 'heatmap',
    colorscale: getColormapScale(state.colormap),
    zmin: effectiveZmin,
    zmax: effectiveZmax,
    hoverongaps: false,
    hovertemplate: 'f₁: %{x:.4f} d⁻¹<br>f₂: %{y:.4f} d⁻¹<br>Fisher z: %{z:.2f}<extra></extra>',
    colorbar: {
      title: { text: 'z(f)', side: 'right', font: { color: th.titleColor, size: 10 } },
      tickfont: { color: th.tickColor, size: 9 },
      len: 0.85,
      thickness: 12
    }
  };

  const shapes = [
    { type: 'line', x0: fMin, x1: fMax, y0: fMin, y1: fMax, line: { color: '#B0BEC5', width: 1.2 } },
    { type: 'line', x0: fRot, x1: fRot, y0: fMin, y1: fMax, line: { color: '#FFFFFF', width: 1.0, dash: 'dot' } },
    { type: 'line', x0: fMin, x1: fMax, y0: fRot, y1: fRot, line: { color: '#FFFFFF', width: 1.0, dash: 'dot' } },
    { type: 'line', x0: fMin, x1: fMax, y0: targetF2, y1: targetF2, line: { color: highlightColor, width: 2.0, dash: 'dash' } }
  ];

  if (state.compSelectedF1 !== undefined && state.compSelectedF1 !== null) {
    shapes.push({
      type: 'line',
      x0: state.compSelectedF1,
      x1: state.compSelectedF1,
      y0: fMin,
      y1: fMax,
      line: { color: '#38BDF8', width: 1.2, dash: 'dot' }
    });
  }

  const traces = [traceHeatmap];

  if (state.showCompFalContours !== false && coh) {
    const fap1 = coh.fap1;
    const fap01 = coh.fap01;
    const fap1An = coh.fap1_analytical;
    const fap01An = coh.fap01_analytical;
    const isMc = coh.fap_type === 'montecarlo' || coh.fap_type === 'rednoise';
    const rawZ = coh.z_matrix;

    if (isMc) {
      // Analytical benchmark reference contours (fine dotted lines)
      const tr1An = createFalContourTrace(fGrid, fGrid, rawZ, fap1An, '#00E676', 1.2, 'dot', '1.0% FAL (Analytical Reference)');
      if (tr1An) traces.push(tr1An);
      const tr01An = createFalContourTrace(fGrid, fGrid, rawZ, fap01An, '#FF2D55', 1.2, 'dot', '0.1% FAL (Analytical Reference)');
      if (tr01An) traces.push(tr01An);

      // Primary Red-Noise MC FAL contours
      const tr1 = createFalContourTrace(fGrid, fGrid, rawZ, fap1, '#00E676', 1.6, 'dash', '1.0% FAL (Red-Noise MC)');
      if (tr1) traces.push(tr1);
      const tr01 = createFalContourTrace(fGrid, fGrid, rawZ, fap01, '#FF2D55', 1.8, 'dashdot', '0.1% FAL (Red-Noise MC)');
      if (tr01) traces.push(tr01);
    } else {
      // Primary Analytical FAL contours
      const tr1 = createFalContourTrace(fGrid, fGrid, rawZ, fap1, '#00E676', 1.6, 'dash', '1.0% FAL (Analytical)');
      if (tr1) traces.push(tr1);
      const tr01 = createFalContourTrace(fGrid, fGrid, rawZ, fap01, '#FF2D55', 1.8, 'dashdot', '0.1% FAL (Analytical)');
      if (tr01) traces.push(tr01);
    }
  }

  if (state.compSelectedF1 !== undefined && state.compSelectedF1 !== null) {
    traces.push({
      x: [state.compSelectedF1],
      y: [targetF2],
      type: 'scatter',
      mode: 'markers',
      name: 'Selected Node',
      marker: {
        symbol: 'circle-open',
        size: 14,
        color: '#FFFFFF',
        line: { width: 2.5, color: '#38BDF8' }
      },
      hoverinfo: 'none',
      showlegend: false
    });
  }

  const layout = {
    paper_bgcolor: th.paperBg,
    plot_bgcolor: '#000000',
    margin: { l: 55, r: 25, t: 25, b: 45 },
    xaxis: {
      title: { text: 'Frequency f₁ (d⁻¹)', font: { color: th.titleColor, size: 11 } },
      tickfont: { color: th.tickColor, size: 10 },
      range: [fMin, fMax],
      gridcolor: '#262626'
    },
    yaxis: {
      title: { text: 'Frequency f₂ (d⁻¹)', font: { color: th.titleColor, size: 11 } },
      tickfont: { color: th.tickColor, size: 10 },
      range: [fMin, fMax],
      scaleanchor: 'x',
      scaleratio: 1,
      gridcolor: '#262626'
    },
    shapes: shapes
  };

  Plotly.react(container, traces, layout, { responsive: true, displayModeBar: false });

  if (!container._hasCompClickListener) {
    container._hasCompClickListener = true;
    container.on('plotly_click', (data) => {
      if (data.points && data.points.length > 0) {
        const pt = data.points[0];
        handleComparisonMapClick(pt.x, pt.y);
      }
    });
  }
}

function renderCompDeltaMap(container, comp, th, targetF2) {
  if (!container || !comp || !comp.delta_z) return;
  const fGrid = comp.f_grid_shared;
  const deltaZ = comp.delta_z;
  const pRotRef = state.comparisonData?.panel_a?.coherence?.p_rot || 27.28;
  const fRot = 1.0 / pRotRef;
  const fMin = fGrid[0];
  const fMax = fGrid[fGrid.length - 1];

  let maxAbs = Math.max(Math.abs(comp.delta_min || 0), Math.abs(comp.delta_max || 0), 1.0);
  if (maxAbs > 15.0) maxAbs = 15.0;

  const deltaColorscale = th.isLight ? [
    [0.0, '#1D4ED8'],
    [0.35, '#93C5FD'],
    [0.5, '#F8FAFC'],
    [0.65, '#FCA5A5'],
    [1.0, '#B91C1C']
  ] : [
    [0.0, '#2563EB'],
    [0.35, '#60A5FA'],
    [0.5, '#181E29'],
    [0.65, '#F87171'],
    [1.0, '#DC2626']
  ];

  const traceHeatmap = {
    x: fGrid,
    y: fGrid,
    z: deltaZ,
    type: 'heatmap',
    colorscale: deltaColorscale,
    zmin: -maxAbs,
    zmax: maxAbs,
    hoverongaps: false,
    hovertemplate: 'f₁: %{x:.4f} d⁻¹<br>f₂: %{y:.4f} d⁻¹<br>Δz (B - A): %{z:.2f}<extra></extra>',
    colorbar: {
      title: { text: 'Δz', side: 'right', font: { color: th.titleColor, size: 10 } },
      tickfont: { color: th.tickColor, size: 9 },
      len: 0.85,
      thickness: 12
    }
  };

  const shapes = [
    { type: 'line', x0: fMin, x1: fMax, y0: fMin, y1: fMax, line: { color: '#B0BEC5', width: 1.2 } },
    { type: 'line', x0: fRot, x1: fRot, y0: fMin, y1: fMax, line: { color: '#FFFFFF', width: 1.0, dash: 'dot' } },
    { type: 'line', x0: fMin, x1: fMax, y0: fRot, y1: fRot, line: { color: '#FFFFFF', width: 1.0, dash: 'dot' } },
    { type: 'line', x0: fMin, x1: fMax, y0: targetF2, y1: targetF2, line: { color: '#38BDF8', width: 2.0, dash: 'dash' } }
  ];

  if (state.compSelectedF1 !== undefined && state.compSelectedF1 !== null) {
    shapes.push({
      type: 'line',
      x0: state.compSelectedF1,
      x1: state.compSelectedF1,
      y0: fMin,
      y1: fMax,
      line: { color: '#38BDF8', width: 1.2, dash: 'dot' }
    });
  }

  const traces = [traceHeatmap];
  if (state.compSelectedF1 !== undefined && state.compSelectedF1 !== null) {
    traces.push({
      x: [state.compSelectedF1],
      y: [targetF2],
      type: 'scatter',
      mode: 'markers',
      name: 'Selected Node',
      marker: {
        symbol: 'circle-open',
        size: 14,
        color: '#FFFFFF',
        line: { width: 2.5, color: '#38BDF8' }
      },
      hoverinfo: 'none',
      showlegend: false
    });
  }

  const layout = {
    paper_bgcolor: th.paperBg,
    plot_bgcolor: '#000000',
    margin: { l: 55, r: 25, t: 25, b: 45 },
    xaxis: {
      title: { text: 'Frequency f₁ (d⁻¹)', font: { color: th.titleColor, size: 11 } },
      tickfont: { color: th.tickColor, size: 10 },
      range: [fMin, fMax],
      gridcolor: '#262626'
    },
    yaxis: {
      title: { text: 'Frequency f₂ (d⁻¹)', font: { color: th.titleColor, size: 11 } },
      tickfont: { color: th.tickColor, size: 10 },
      range: [fMin, fMax],
      scaleanchor: 'x',
      scaleratio: 1,
      gridcolor: '#262626'
    },
    shapes: shapes
  };

  Plotly.react(container, traces, layout, { responsive: true, displayModeBar: false });

  if (!container._hasCompClickListener) {
    container._hasCompClickListener = true;
    container.on('plotly_click', (data) => {
      if (data.points && data.points.length > 0) {
        const pt = data.points[0];
        handleComparisonMapClick(pt.x, pt.y);
      }
    });
  }
}

function renderCompHorizontalCut(hCut, labelA, labelB, th, bw2r) {
  if (!el.plotCompHorizSlice || !hCut) return;
  const f1Vals = hCut.f1;
  const za = hCut.z_a;
  const zb = hCut.z_b;
  const fRot = 1.0 / 27.28;

  const traceA = {
    x: f1Vals,
    y: za,
    type: 'scatter',
    mode: 'lines',
    name: labelA.length > 25 ? labelA.slice(0, 25) + '...' : labelA,
    line: { color: '#00E676', width: 2.2 },
    hoverinfo: 'x+y'
  };

  const traceB = {
    x: f1Vals,
    y: zb,
    type: 'scatter',
    mode: 'lines',
    name: labelB.length > 25 ? labelB.slice(0, 25) + '...' : labelB,
    line: { color: '#FF9100', width: 2.2 },
    hoverinfo: 'x+y'
  };

  const tracePeakA = {
    x: [hCut.peak_a.f],
    y: [hCut.peak_a.z],
    type: 'scatter',
    mode: 'markers',
    name: `Peak A: P = ${hCut.peak_a.P.toFixed(2)} d (z = ${hCut.peak_a.z.toFixed(2)})`,
    marker: { color: '#00E676', size: 8, symbol: 'circle', line: { color: '#000000', width: 1.2 } }
  };

  const tracePeakB = {
    x: [hCut.peak_b.f],
    y: [hCut.peak_b.z],
    type: 'scatter',
    mode: 'markers',
    name: `Peak B: P = ${hCut.peak_b.P.toFixed(2)} d (z = ${hCut.peak_b.z.toFixed(2)})`,
    marker: { color: '#FF9100', size: 8, symbol: 'circle', line: { color: '#000000', width: 1.2 } }
  };

  const shapes = [
    {
      type: 'rect', xref: 'x', yref: 'paper',
      x0: fRot - bw2r / 2.0, x1: fRot + bw2r / 2.0, y0: 0, y1: 1,
      fillcolor: 'rgba(128, 128, 128, 0.20)', line: { width: 0 }
    },
    { type: 'line', xref: 'paper', x0: 0, x1: 1, y0: hCut.fap01_a, y1: hCut.fap01_a, line: { color: '#00E676', width: 1.1, dash: 'dot' } },
    { type: 'line', xref: 'paper', x0: 0, x1: 1, y0: hCut.fap01_b, y1: hCut.fap01_b, line: { color: '#FF9100', width: 1.1, dash: 'dot' } }
  ];

  const maxZ = Math.max(...za, ...zb, hCut.fap01_a, hCut.fap01_b) * 1.15;

  const layout = {
    paper_bgcolor: th.paperBg,
    plot_bgcolor: th.plotBg,
    margin: { l: 55, r: 25, t: 25, bottom: 45 },
    xaxis: {
      title: { text: 'Frequency f₁ (d⁻¹)', font: { color: th.titleColor, size: 11 } },
      tickfont: { color: th.tickColor, size: 10 },
      range: [f1Vals[0], f1Vals[f1Vals.length - 1]],
      gridcolor: th.gridColor
    },
    yaxis: {
      title: { text: 'Fisher z(f₁)', font: { color: th.titleColor, size: 11 } },
      tickfont: { color: th.tickColor, size: 10 },
      range: [-0.05, maxZ],
      gridcolor: th.gridColor
    },
    legend: {
      x: 0.98, y: 0.98, xanchor: 'right', yanchor: 'top',
      font: { color: th.textColor, size: 9 },
      bgcolor: th.isLight ? 'rgba(255, 255, 255, 0.9)' : 'rgba(20, 24, 33, 0.9)'
    },
    shapes: shapes
  };

  Plotly.react(el.plotCompHorizSlice, [traceA, traceB, tracePeakA, tracePeakB], layout, { responsive: true, displayModeBar: false });
}

function renderCompAntiDiagonalCut(adCut, labelA, labelB, th) {
  if (!el.plotCompAntiDiagSlice) return;
  if (!adCut || !adCut.s || adCut.s.length === 0) {
    el.plotCompAntiDiagSlice.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:12px;color:var(--text-muted);padding:20px;text-align:center;">Anti-diagonal slice data unavailable.</div>';
    return;
  }

  const s = adCut.s;
  const deltaF = adCut.delta_f || s.map(sv => sv * Math.SQRT2);
  const zA = adCut.z_a;
  const zB = adCut.z_b;

  if (el.titleCompAntiDiag && adCut.f_mid) {
    el.titleCompAntiDiag.textContent = `Anti-Diagonal Slice: Beat Spectrum z(Δf | f_mid = ${adCut.f_mid.toFixed(5)} d⁻¹, P_mid = ${adCut.p_mid.toFixed(2)} d)`;
  }

  const hoverA = [];
  const hoverB = [];
  for (let i = 0; i < deltaF.length; i++) {
    const df = deltaF[i];
    const pb = Math.abs(df) > 1e-5 ? (1.0 / Math.abs(df)).toFixed(1) + ' d' : 'None';
    hoverA.push(`Δf: ${df.toFixed(5)} d⁻¹ (P_beat: ${pb})<br>${labelA}: z = ${zA[i].toFixed(3)}`);
    hoverB.push(`Δf: ${df.toFixed(5)} d⁻¹ (P_beat: ${pb})<br>${labelB}: z = ${zB[i].toFixed(3)}`);
  }

  const traceA = {
    x: deltaF,
    y: zA,
    type: 'scatter',
    mode: 'lines',
    name: labelA.length > 25 ? labelA.slice(0, 25) + '...' : labelA,
    line: { color: '#00E676', width: 2.2 },
    hoverinfo: 'text',
    text: hoverA
  };

  const traceB = {
    x: deltaF,
    y: zB,
    type: 'scatter',
    mode: 'lines',
    name: labelB.length > 25 ? labelB.slice(0, 25) + '...' : labelB,
    line: { color: '#FF9100', width: 2.2 },
    hoverinfo: 'text',
    text: hoverB
  };

  const traces = [traceA, traceB];

  if (adCut.peak_a && adCut.peak_a.delta_f !== undefined) {
    const pkA = adCut.peak_a;
    const pbText = pkA.p_beat ? `P_beat = ${pkA.p_beat.toFixed(1)} d` : `Δf = ${pkA.delta_f.toFixed(4)} d⁻¹`;
    traces.push({
      x: [pkA.delta_f],
      y: [pkA.z],
      type: 'scatter',
      mode: 'markers',
      name: `Peak A (${pbText}, z=${pkA.z.toFixed(2)})`,
      marker: { color: '#00E676', size: 8, symbol: 'circle', line: { color: '#000000', width: 1.2 } }
    });
  }

  if (adCut.peak_b && adCut.peak_b.delta_f !== undefined) {
    const pkB = adCut.peak_b;
    const pbText = pkB.p_beat ? `P_beat = ${pkB.p_beat.toFixed(1)} d` : `Δf = ${pkB.delta_f.toFixed(4)} d⁻¹`;
    traces.push({
      x: [pkB.delta_f],
      y: [pkB.z],
      type: 'scatter',
      mode: 'markers',
      name: `Peak B (${pbText}, z=${pkB.z.toFixed(2)})`,
      marker: { color: '#FF9100', size: 8, symbol: 'circle', line: { color: '#000000', width: 1.2 } }
    });
  }

  const shapes = [
    {
      type: 'line', xref: 'x', yref: 'paper',
      x0: 0.0, x1: 0.0, y0: 0, y1: 1,
      line: { color: 'rgba(128, 128, 128, 0.4)', width: 1.2, dash: 'dot' }
    }
  ];

  if (adCut.fap01_a) {
    shapes.push({ type: 'line', xref: 'paper', x0: 0, x1: 1, y0: adCut.fap01_a, y1: adCut.fap01_a, line: { color: '#00E676', width: 1.1, dash: 'dot' } });
  }
  if (adCut.fap01_b) {
    shapes.push({ type: 'line', xref: 'paper', x0: 0, x1: 1, y0: adCut.fap01_b, y1: adCut.fap01_b, line: { color: '#FF9100', width: 1.1, dash: 'dot' } });
  }

  let maxZ = 2.0;
  zA.forEach(v => { if (v > maxZ) maxZ = v; });
  zB.forEach(v => { if (v > maxZ) maxZ = v; });
  if (adCut.fap01_a && adCut.fap01_a > maxZ) maxZ = adCut.fap01_a;
  if (adCut.fap01_b && adCut.fap01_b > maxZ) maxZ = adCut.fap01_b;

  const layout = {
    paper_bgcolor: th.paperBg,
    plot_bgcolor: th.plotBg,
    margin: { l: 55, r: 25, t: 25, bottom: 45 },
    xaxis: {
      title: { text: 'Separation Frequency Δf (d⁻¹)', font: { color: th.titleColor, size: 11 } },
      tickfont: { color: th.tickColor, size: 10 },
      gridcolor: th.gridColor
    },
    yaxis: {
      title: { text: 'Fisher z(Δf)', font: { color: th.titleColor, size: 11 } },
      tickfont: { color: th.tickColor, size: 10 },
      range: [-0.05, maxZ * 1.15],
      gridcolor: th.gridColor
    },
    legend: {
      x: 0.98, y: 0.98, xanchor: 'right', yanchor: 'top',
      font: { color: th.textColor, size: 9 },
      bgcolor: th.isLight ? 'rgba(255, 255, 255, 0.9)' : 'rgba(20, 24, 33, 0.9)'
    },
    shapes: shapes
  };

  Plotly.react(el.plotCompAntiDiagSlice, traces, layout, { responsive: true, displayModeBar: false });
}

function sampleMatrixZ(coh, f1, f2) {
  if (!coh || !coh.f_grid || !coh.z_matrix) return 0.0;
  const grid = coh.f_grid;
  const n = grid.length;
  if (f1 < grid[0] || f1 > grid[n - 1] || f2 < grid[0] || f2 > grid[n - 1]) return 0.0;

  let i = 0;
  while (i < n - 1 && grid[i + 1] < f2) i++;
  let j = 0;
  while (j < n - 1 && grid[j + 1] < f1) j++;

  i = Math.min(i, n - 2);
  j = Math.min(j, n - 2);

  const df2 = grid[i + 1] - grid[i];
  const df1 = grid[j + 1] - grid[j];
  const tf2 = df2 > 0 ? (f2 - grid[i]) / df2 : 0;
  const tf1 = df1 > 0 ? (f1 - grid[j]) / df1 : 0;

  const z00 = coh.z_matrix[i][j];
  const z01 = coh.z_matrix[i][j + 1];
  const z10 = coh.z_matrix[i + 1][j];
  const z11 = coh.z_matrix[i + 1][j + 1];

  return (1 - tf2) * ((1 - tf1) * z00 + tf1 * z01) + tf2 * ((1 - tf1) * z10 + tf1 * z11);
}

function renderCompNodeMetrics(f1, f2) {
  if (!state.comparisonData) return;
  const panelA = state.comparisonData.panel_a;
  const panelB = state.comparisonData.panel_b;
  const comp = state.comparisonData.comparison;
  const cohA = panelA.coherence;
  const cohB = panelB.coherence;

  const p1 = f1 > 0 ? 1.0 / f1 : 999.0;
  const p2 = f2 > 0 ? 1.0 / f2 : 999.0;
  const deltaF = Math.abs(f1 - f2);
  const pBeat = deltaF > 1e-6 ? 1.0 / deltaF : null;

  if (el.compNodePeriods) el.compNodePeriods.textContent = `P₁ = ${p1.toFixed(2)} d, P₂ = ${p2.toFixed(2)} d`;
  if (el.compNodeFreqs) el.compNodeFreqs.textContent = `f₁ = ${f1.toFixed(5)}, f₂ = ${f2.toFixed(5)} d⁻¹`;
  if (el.compNodePbeat) el.compNodePbeat.textContent = pBeat ? `P_beat = ${pBeat.toFixed(1)} d` : 'P_beat = ∞ (Diagonal)';
  if (el.compNodeDeltaF) el.compNodeDeltaF.textContent = `Δf = ${deltaF.toFixed(5)} d⁻¹`;

  const zA = sampleMatrixZ(cohA, f1, f2);
  const zB = sampleMatrixZ(cohB, f1, f2);
  const deltaZ = zB - zA;

  if (el.compNodeZA) el.compNodeZA.textContent = `z_A = ${zA.toFixed(2)}`;
  if (el.compNodeZB) el.compNodeZB.textContent = `z_B = ${zB.toFixed(2)}`;
  if (el.compNode2RA) el.compNode2RA.textContent = `2ℛ_A: ${cohA.bw_2R.toFixed(4)} d⁻¹`;
  if (el.compNode2RB) el.compNode2RB.textContent = `2ℛ_B: ${cohB.bw_2R.toFixed(4)} d⁻¹`;

  function getSigBadgeInfo(z, f01, f1, f5) {
    if (z >= f01) return { text: 'p < 0.1% FAP', cls: 'sig-high' };
    if (z >= f1) return { text: 'p < 1.0% FAP', cls: 'sig-med' };
    if (z >= f5) return { text: 'p < 5.0% FAP', cls: 'sig-low' };
    return { text: 'Noise Floor', cls: 'sig-none' };
  }

  if (el.compBadgeZA && cohA.fap01) {
    const sA = getSigBadgeInfo(zA, cohA.fap01, cohA.fap1, cohA.fap5);
    el.compBadgeZA.textContent = sA.text;
    el.compBadgeZA.className = 'm-badge ' + sA.cls;
  }
  if (el.compBadgeZB && cohB.fap01) {
    const sB = getSigBadgeInfo(zB, cohB.fap01, cohB.fap1, cohB.fap5);
    el.compBadgeZB.textContent = sB.text;
    el.compBadgeZB.className = 'm-badge ' + sB.cls;
  }

  if (el.compNodeDeltaZ) {
    const sign = deltaZ > 0 ? '+' : '';
    el.compNodeDeltaZ.textContent = `Δz = ${sign}${deltaZ.toFixed(2)}`;
    el.compNodeDeltaZ.style.color = deltaZ > 0.5 ? '#FF9100' : (deltaZ < -0.5 ? '#00E676' : '#E2E8F0');
  }

  if (el.compNodeDeltaZDesc) {
    if (deltaZ > 0.5) {
      el.compNodeDeltaZDesc.textContent = `${comp.label_b} shows stronger coupling (+${deltaZ.toFixed(2)})`;
    } else if (deltaZ < -0.5) {
      el.compNodeDeltaZDesc.textContent = `${comp.label_a} shows stronger coupling (${deltaZ.toFixed(2)})`;
    } else {
      el.compNodeDeltaZDesc.textContent = `Comparable coupling between campaigns (|Δz| ≤ 0.5)`;
    }
  }

  const isMcA = cohA.fap_type === 'montecarlo' || cohA.fap_type === 'rednoise';
  const isMcB = cohB.fap_type === 'montecarlo' || cohB.fap_type === 'rednoise';
  if (el.compFapTitleA) el.compFapTitleA.textContent = isMcA ? 'Panel A Red-Noise MC FAPs' : 'Panel A Analytical FAPs';
  if (el.compFapTitleB) el.compFapTitleB.textContent = isMcB ? 'Panel B Red-Noise MC FAPs' : 'Panel B Analytical FAPs';

  if (el.compFapA01 && cohA.fap01) el.compFapA01.textContent = `0.1%: ${cohA.fap01.toFixed(2)}`;
  if (el.compFapA1 && cohA.fap1) el.compFapA1.textContent = `1.0%: ${cohA.fap1.toFixed(2)}`;
  if (el.compFapA5 && cohA.fap5) el.compFapA5.textContent = `5.0%: ${cohA.fap5.toFixed(2)}`;

  if (el.compFapB01 && cohB.fap01) el.compFapB01.textContent = `0.1%: ${cohB.fap01.toFixed(2)}`;
  if (el.compFapB1 && cohB.fap1) el.compFapB1.textContent = `1.0%: ${cohB.fap1.toFixed(2)}`;
  if (el.compFapB5 && cohB.fap5) el.compFapB5.textContent = `5.0%: ${cohB.fap5.toFixed(2)}`;
}

async function computeComp1D(panel) {
  const isA = panel === 'A';
  const dsSelect = isA ? el.comp1DDatasetA : el.comp1DDatasetB;
  const presetSelect = isA ? el.comp1DPresetA : el.comp1DPresetB;
  const s1Select = isA ? el.comp1DSeries1A : el.comp1DSeries1B;
  const s2Select = isA ? el.comp1DSeries2A : el.comp1DSeries2B;
  const kInput = isA ? el.comp1DKInputA : el.comp1DKInputB;
  const btnCompute = isA ? el.btnComp1DComputeA : el.btnComp1DComputeB;

  const dsKey = dsSelect?.value || 'harpsn';
  const pKey = presetSelect?.value || 'cycle_min_3yr';
  const s1 = s1Select?.value || 'RV';
  let s2 = s2Select?.value || 'FWHM';
  const kVal = Math.max(2, parseInt(kInput?.value || 4, 10));

  if (!dsKey || !s1 || !s2) return;

  if (s1 === s2) {
    showToast(`1D Bivariate Coherence requires distinct indicators (s₁ ≠ s₂).`);
    return;
  }

  try {
    if (btnCompute) {
      btnCompute.textContent = '...';
      btnCompute.disabled = true;
    }

    const payload = {
      dataset: dsKey,
      preset: pKey,
      series1: s1,
      series2: s2,
      seg_mode: 'adaptive',
      k_segments: kVal,
      overlap: 0.5,
      taper: 'None',
      fmax: 0.15
    };

    const res = await fetch('/api/welch_1d', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (data.status === 'ok') {
      if (isA) {
        state.comp1DDataA = data.welch_1d;
      } else {
        state.comp1DDataB = data.welch_1d;
      }
      renderComp1DSinglePlot(panel);
    } else {
      showToast(`Panel ${panel} 1D Welch error: ${data.message}`);
    }
  } catch (err) {
    console.error(`Error computing 1D Welch for panel ${panel}:`, err);
    showToast(`Failed to compute 1D Welch for Panel ${panel}.`);
  } finally {
    if (btnCompute) {
      btnCompute.textContent = 'Plot 1D';
      btnCompute.disabled = false;
    }
  }
}

function renderComp1DSinglePlot(panel) {
  const isA = panel === 'A';
  const container = isA ? el.plotComp1DCohA : el.plotComp1DCohB;
  const w1d = isA ? state.comp1DDataA : state.comp1DDataB;
  const panelCoh = state.comparisonData?.[isA ? 'panel_a' : 'panel_b']?.coherence;
  const colorHex = isA ? '#00E676' : '#FF9100';
  const titleEl = isA ? el.titleComp1DCohA : el.titleComp1DCohB;
  const resetBtnEl = isA ? el.btnResetZoomComp1DCohA : el.btnResetZoomComp1DCohB;
  const th = getThemeColors();

  if (!container) return;

  if (titleEl) {
    if (w1d) {
      titleEl.textContent = `Panel ${panel}: ${w1d.series1_label || 'Series 1'} ⨉ ${w1d.series2_label || 'Series 2'} (K=${w1d.k_segs || '—'}, 2ℛ=${(w1d.two_r || panelCoh?.bw_2R || 0).toFixed(4)} d⁻¹)`;
    } else {
      titleEl.textContent = `Panel ${panel}: 1D Welch Bivariate Coherence z(f)`;
    }
  }

  const zData = w1d?.z_fisher || w1d?.z_sub;
  const fGrid = w1d?.f_grid || w1d?.f_sub;

  if (!zData || !fGrid || zData.length === 0) {
    container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:12px;color:var(--text-muted);padding:20px;text-align:center;">Select Series 1 & Series 2 above and click "Plot 1D" to compute 1D Welch Bivariate Coherence z(f).</div>';
    return;
  }

  const traceCoh = {
    x: fGrid,
    y: zData,
    type: 'scatter',
    mode: 'lines',
    name: `${w1d.series1_label || 'S1'} ⨉ ${w1d.series2_label || 'S2'} z(f)`,
    line: { color: colorHex, width: 2.2 },
    hoverinfo: 'x+y'
  };

  const traces = [traceCoh];

  if (w1d.peak_f && w1d.peak_z !== undefined) {
    traces.push({
      x: [w1d.peak_f],
      y: [w1d.peak_z],
      type: 'scatter',
      mode: 'markers',
      name: `Peak: P = ${(w1d.peak_p || (1.0 / w1d.peak_f)).toFixed(2)} d (z = ${w1d.peak_z.toFixed(2)})`,
      marker: { color: colorHex, size: 8, symbol: 'circle', line: { color: '#000000', width: 1.2 } }
    });
  }

  const fRot = 1.0 / (w1d.p_rot || panelCoh?.p_rot || 27.28);
  const twoR = w1d.two_r || panelCoh?.bw_2R || 0.005;
  const shapes = [];

  // Ramirez Delgado 2R bandwidth harmonic resonance shading
  [1, 2, 3, 4].forEach(h => {
    const fh = h * fRot;
    if (fh <= fGrid[fGrid.length - 1] * 1.05) {
      shapes.push({
        type: 'rect',
        x0: fh - twoR * 0.5,
        x1: fh + twoR * 0.5,
        y0: 0,
        y1: 1,
        yref: 'paper',
        fillcolor: 'rgba(128, 128, 128, 0.18)',
        line: { width: 0 }
      });
      shapes.push({
        type: 'line',
        x0: fh,
        x1: fh,
        y0: 0,
        y1: 1,
        yref: 'paper',
        line: { color: '#78909C', width: 1.0, dash: 'dashdot' }
      });
    }
  });

  // FAP threshold lines (Fisher z(f) scale)
  const fap01 = w1d.fap01 || panelCoh?.fap01 || 3.0;
  const fap1 = w1d.fap1 || panelCoh?.fap1 || 2.5;
  const fap5 = w1d.fap5 || panelCoh?.fap5 || 2.0;

  shapes.push(
    { type: 'line', xref: 'paper', x0: 0, x1: 1, y0: fap01, y1: fap01, line: { color: '#FF2D55', width: 1.2, dash: 'dash' } },
    { type: 'line', xref: 'paper', x0: 0, x1: 1, y0: fap1, y1: fap1, line: { color: '#00E676', width: 1.1, dash: 'dash' } },
    { type: 'line', xref: 'paper', x0: 0, x1: 1, y0: fap5, y1: fap5, line: { color: '#AF52DE', width: 1.1, dash: 'dash' } }
  );

  const maxZ = Math.max(...zData, fap01) * 1.18;

  const layout = {
    paper_bgcolor: th.paperBg,
    plot_bgcolor: th.plotBg,
    margin: { l: 55, r: 25, t: 25, b: 45 },
    xaxis: {
      title: { text: 'Frequency f (d⁻¹)', font: { color: th.titleColor, size: 11 } },
      tickfont: { color: th.tickColor, size: 10 },
      range: [fGrid[0], fGrid[fGrid.length - 1]],
      gridcolor: th.gridColor
    },
    yaxis: {
      title: { text: 'z(f)', font: { color: th.titleColor, size: 11 } },
      tickfont: { color: th.tickColor, size: 10 },
      range: [-0.05, maxZ],
      gridcolor: th.gridColor
    },
    shapes: shapes,
    legend: {
      x: 0.98, y: 0.98, xanchor: 'right', yanchor: 'top',
      font: { color: th.textColor, size: 9 },
      bgcolor: th.isLight ? 'rgba(255, 255, 255, 0.9)' : 'rgba(20, 24, 33, 0.9)'
    }
  };

  Plotly.react(container, traces, layout, { responsive: true, displayModeBar: false });

  if (resetBtnEl && !resetBtnEl._bound) {
    resetBtnEl._bound = true;
    resetBtnEl.addEventListener('click', () => {
      Plotly.relayout(container, {
        'xaxis.autorange': true,
        'yaxis.autorange': true
      });
    });
  }
}

function renderComp1DPanels() {
  if (!state.comparisonData) return;
  const panelA = state.comparisonData.panel_a;
  const panelB = state.comparisonData.panel_b;

  if (!state.comp1DDataA && panelA.welch_1d && (panelA.welch_1d.z_fisher || panelA.welch_1d.z_sub)) {
    state.comp1DDataA = panelA.welch_1d;
  }
  if (!state.comp1DDataB && panelB.welch_1d && (panelB.welch_1d.z_fisher || panelB.welch_1d.z_sub)) {
    state.comp1DDataB = panelB.welch_1d;
  }

  renderComp1DSinglePlot('A');
  renderComp1DSinglePlot('B');
}

async function exportComparisonPNG() {
  try {
    let vmax = 4.0;
    if (state.contrastMode === 'medium') vmax = 6.0;
    if (state.contrastMode === 'full') vmax = 12.0;

    const res = await fetch('/api/export_comparison_png', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        colormap: state.colormap,
        vmin: state.vmin,
        vmax: vmax
      })
    });
    const data = await res.json();
    if (data.status === 'ok') {
      const a = document.createElement('a');
      a.href = data.url;
      a.download = data.filename;
      a.target = '_blank';
      a.click();
      showToast(`Comparison composite saved to ${data.filename}`);
    } else {
      showToast(`Export error: ${data.message}`);
    }
  } catch (err) {
    console.error('Export error:', err);
    showToast('Failed to export comparison PNG.');
  }
}

async function exportComparisonCSV() {
  try {
    const res = await fetch('/api/export_comparison_csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const data = await res.json();
    if (data.status === 'ok') {
      const a = document.createElement('a');
      a.href = data.url;
      a.download = data.filename;
      a.target = '_blank';
      a.click();
      showToast(`Comparison slices CSV saved to ${data.filename}`);
    } else {
      showToast(`Export error: ${data.message}`);
    }
  } catch (err) {
    console.error('Export CSV error:', err);
    showToast('Failed to export comparison CSV.');
  }
}

// -----------------------------------------------------------------------------
// EVENT LISTENERS & SETUP
// -----------------------------------------------------------------------------
function setupEventListeners() {
  initViewTabs();
  setupComparisonUI();

  // Landing page launch buttons
  document.querySelectorAll('[data-launch]').forEach(card => {
    card.addEventListener('click', () => {
      const v = card.dataset.launch;
      if (v) switchView(v);
    });
  });

  if (el.btnLaunchComparison) {
    el.btnLaunchComparison.addEventListener('click', () => {
      switchView('comparison');
    });
  }

  if (el.tabBtnComparison) {
    el.tabBtnComparison.addEventListener('click', () => {
      switchView('comparison');
    });
  }

  // Theme Toggle (Dark / Light Mode)
  if (el.themeToggleBtn) {
    el.themeToggleBtn.addEventListener('click', toggleTheme);
  }

  // Reset Zoom for Time Series
  if (el.btnResetZoomTS) {
    el.btnResetZoomTS.addEventListener('click', () => {
      Plotly.relayout(el.plotTimeSeries, { 'xaxis.autorange': true, 'yaxis.autorange': true });
    });
  }

  // Dataset change
  el.datasetSelect.addEventListener('change', (e) => {
    state.currentDataset = e.target.value;
    populateDatasetUI();
    state.diagnosticsData = null;
    state.welch1DData = null;
    updateLandingStats();
    if (state.activeView === 'timeseries') {
      computeTimeseriesDiagnostics();
    } else if (state.activeView === 'welch1d') {
      computeWelch1D();
    } else {
      runComputation();
    }
  });

  // Series changes
  el.series1Select.addEventListener('change', (e) => state.series1 = e.target.value);
  el.series2Select.addEventListener('change', (e) => state.series2 = e.target.value);
  el.presetSelect.addEventListener('change', (e) => {
    state.preset = e.target.value;
    if (state.activeView === 'timeseries') computeTimeseriesDiagnostics();
    else if (state.activeView === 'welch1d') computeWelch1D();
    else runComputation();
  });

  // Mode segmented control
  el.segBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const parent = btn.parentElement;
      parent.querySelectorAll('.seg-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      if (btn.dataset.mode) {
        state.mode = btn.dataset.mode;
        el.series2Container.style.display = state.mode === 'cross' ? 'block' : 'none';
      } else if (btn.dataset.taper) {
        state.taper = btn.dataset.taper;
      } else if (btn.dataset.fap) {
        state.fap_type = btn.dataset.fap;
        el.mcContainer.style.display = state.fap_type === 'montecarlo' ? 'block' : 'none';
      } else if (btn.dataset.lsLayout) {
        state.lsLayout = btn.dataset.lsLayout;
        renderLSSpectraPlot();
      } else if (btn.dataset.welchMode) {
        state.welchSegMode = btn.dataset.welchMode;
      } else if (btn.dataset.welchTaper) {
        state.welchTaper = btn.dataset.welchTaper;
      } else if (btn.dataset.dualSeg) {
        state.dualSegSource = btn.dataset.dualSeg;
        if (state.dualSegSource === 'tab2') {
          if (el.dualUniformControls) el.dualUniformControls.style.display = 'none';
          if (el.dualTab2Badge) el.dualTab2Badge.style.display = 'block';
          updateDualTab2Badge();
        } else {
          if (el.dualUniformControls) el.dualUniformControls.style.display = 'block';
          if (el.dualTab2Badge) el.dualTab2Badge.style.display = 'none';
        }
      }
    });
  });

  if (el.btnSyncFromTab2) {
    el.btnSyncFromTab2.addEventListener('click', () => switchView('welch1d'));
  }

  initUploadModal();

  if (el.uploadDelimiter) {
    el.uploadDelimiter.addEventListener('change', reInspectUpload);
  }
  if (el.uploadCommentChar) {
    el.uploadCommentChar.addEventListener('change', reInspectUpload);
  }

  // Synchronized L Input & Slider (View 3)
  function updateChipsActiveState(val) {
    el.chips.forEach(c => {
      if (parseInt(c.dataset.l) === val) c.classList.add('active');
      else c.classList.remove('active');
    });
  }

  el.lengthInput.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    if (!isNaN(val) && val >= 10) {
      state.L_pts = val;
      if (val > parseInt(el.lengthSlider.max)) el.lengthSlider.max = Math.max(1500, val);
      el.lengthSlider.value = val;
      updateChipsActiveState(val);
    }
  });

  el.lengthSlider.addEventListener('input', (e) => {
    state.L_pts = parseInt(e.target.value);
    el.lengthInput.value = state.L_pts;
    updateChipsActiveState(state.L_pts);
  });

  el.chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const val = parseInt(chip.dataset.l);
      state.L_pts = val;
      if (val > parseInt(el.lengthSlider.max)) el.lengthSlider.max = val;
      el.lengthSlider.value = val;
      el.lengthInput.value = val;
      updateChipsActiveState(val);
    });
  });

  // View 1 Spectral Window Span Chips
  document.querySelectorAll('.chip-fwin').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.chip-fwin').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const val = parseFloat(chip.dataset.fwin);
      state.fwinMax = val;
      if (el.fwinMaxInput) el.fwinMaxInput.value = val;
      computeTimeseriesDiagnostics();
    });
  });

  if (el.fwinMaxInput) {
    el.fwinMaxInput.addEventListener('change', () => {
      const val = parseFloat(el.fwinMaxInput.value);
      if (!isNaN(val) && val > 0) {
        state.fwinMax = val;
        computeTimeseriesDiagnostics();
      }
    });
  }

  // View 1 Frequency Grid (fmin and fmax) Inputs
  if (el.tsFminInput) {
    const handleFmin = () => {
      const val = parseFloat(el.tsFminInput.value);
      if (!isNaN(val) && val >= 0) {
        state.tsFmin = val;
        computeTimeseriesDiagnostics();
      }
    };
    el.tsFminInput.addEventListener('change', handleFmin);
    el.tsFminInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleFmin();
    });
  }

  if (el.tsFmaxInput) {
    const handleFmax = () => {
      const val = parseFloat(el.tsFmaxInput.value);
      if (!isNaN(val) && val > 0) {
        state.tsFmax = val;
        computeTimeseriesDiagnostics();
      }
    };
    el.tsFmaxInput.addEventListener('change', handleFmax);
    el.tsFmaxInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleFmax();
    });
  }

  // View 2 (1D Welch) Controls
  if (el.welchSeries1Select) {
    el.welchSeries1Select.addEventListener('change', (e) => {
      state.welchSeries1 = e.target.value;
      ensureDistinct1DSeries();
    });
  }

  if (el.welchSeries2Select) {
    el.welchSeries2Select.addEventListener('change', (e) => {
      state.welchSeries2 = e.target.value;
      ensureDistinct1DSeries();
    });
  }

  // Synchronized K Input & Slider (View 2)
  function updateKChipsActiveState(val) {
    document.querySelectorAll('.chip-k').forEach(c => {
      if (parseInt(c.dataset.k) === val) c.classList.add('active');
      else c.classList.remove('active');
    });
  }

  if (el.welchKInput) {
    el.welchKInput.addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      if (!isNaN(val) && val >= 1) {
        state.welchK = val;
        state.customSegments = null;
        if (el.welchKSlider) el.welchKSlider.value = Math.min(15, val);
        updateKChipsActiveState(val);
      }
    });
  }

  if (el.welchKSlider) {
    el.welchKSlider.addEventListener('input', (e) => {
      state.welchK = parseInt(e.target.value);
      state.customSegments = null;
      if (el.welchKInput) el.welchKInput.value = state.welchK;
      updateKChipsActiveState(state.welchK);
    });
  }

  document.querySelectorAll('.chip-k').forEach((chip) => {
    chip.addEventListener('click', () => {
      const val = parseInt(chip.dataset.k);
      state.welchK = val;
      state.customSegments = null;
      if (el.welchKInput) el.welchKInput.value = val;
      if (el.welchKSlider) el.welchKSlider.value = val;
      updateKChipsActiveState(val);
      computeWelch1D();
    });
  });

  // Power Spectrum Curve Toggles (View 2)
  if (el.chkLSSeries1) {
    el.chkLSSeries1.addEventListener('change', (e) => {
      state.welchCurves.ls1 = e.target.checked;
      renderWelchPSDPlot();
    });
  }
  if (el.chkWelchSeries1) {
    el.chkWelchSeries1.addEventListener('change', (e) => {
      state.welchCurves.welch1 = e.target.checked;
      renderWelchPSDPlot();
    });
  }
  if (el.chkLSSeries2) {
    el.chkLSSeries2.addEventListener('change', (e) => {
      state.welchCurves.ls2 = e.target.checked;
      renderWelchPSDPlot();
    });
  }
  if (el.chkWelchSeries2) {
    el.chkWelchSeries2.addEventListener('change', (e) => {
      state.welchCurves.welch2 = e.target.checked;
      renderWelchPSDPlot();
    });
  }

  if (el.btnRecalcWelch1D) el.btnRecalcWelch1D.addEventListener('click', computeWelch1D);
  if (el.btnAutocalcSegments) el.btnAutocalcSegments.addEventListener('click', autocalculateSegments);
  if (el.btnApplyCustomSegments) el.btnApplyCustomSegments.addEventListener('click', applyCustomSegmentBounds);
  if (el.btnExportWelch1DPNG) el.btnExportWelch1DPNG.addEventListener('click', exportWelch1DPNG);

  // Welch PSD domain and normalization buttons
  document.querySelectorAll('[data-welchpsd]').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.welchpsd;
      const val = btn.dataset.val;
      btn.parentElement.querySelectorAll('.domain-btn, .scale-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (type === 'domain') {
        state.welchPsdDomain = val;
      } else if (type === 'norm') {
        state.welchPsdNorm = val; // 'peak' or 'raw'
      }
      renderWelchPSDPlot();
    });
  });

  // Welch Coherence domain and scale buttons
  document.querySelectorAll('[data-welchcoh]').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.welchcoh;
      const val = btn.dataset.val;
      btn.parentElement.querySelectorAll('.domain-btn, .scale-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (type === 'domain') state.welchCohDomain = val;
      else if (type === 'scale') state.welchCohScale = val;
      renderWelch1DCohPlot();
    });
  });

  // LS Domain buttons (View 1)
  document.querySelectorAll('[data-lscut]').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.lscut;
      const val = btn.dataset.val;
      btn.parentElement.querySelectorAll('.domain-btn, .scale-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (type === 'domain') state.lsDomain = val;
      else if (type === 'scale') state.lsScale = val;
      renderLSSpectraPlot();
    });
  });

  if (el.btnExportDiagPNG) el.btnExportDiagPNG.addEventListener('click', exportDiagPNG);

  // Horizontal Cuts Controls (View 3)
  if (el.btnAddHorizontalCut) {
    el.btnAddHorizontalCut.addEventListener('click', addCustomHorizontalCut);
  }
  if (el.inputCustomCutFreq) {
    el.inputCustomCutFreq.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addCustomHorizontalCut();
    });
  }

  // Automated Peak Detector Controls (View 3)
  if (el.btnRescanPeaks) {
    el.btnRescanPeaks.addEventListener('click', rescanPeaks);
  }
  if (el.peakFapFilter) {
    el.peakFapFilter.addEventListener('change', rescanPeaks);
  }

  // Harmonics Lines Select
  el.harmonicsSelect.addEventListener('change', (e) => {
    state.nHarmonics = parseInt(e.target.value) || 2;
    if (state.coherenceData) {
      updateMatrixShapes();
      renderHorizontalCut();
    }
  });

  // Custom Periodicities
  function applyCustomPeriods() {
    const str = el.customPeriodsInput.value.trim();
    if (!str) {
      state.customPeriods = [];
      showToast('Cleared custom periodicities.');
    } else {
      const parts = str.split(/[,;\s]+/);
      const parsed = [];
      for (const p of parts) {
        const num = parseFloat(p);
        if (!isNaN(num) && num > 0) parsed.push(num);
      }
      state.customPeriods = parsed;
      if (parsed.length > 0) showToast(`Applied ${parsed.length} custom periodicities.`);
    }
    if (state.coherenceData) {
      updateMatrixShapes();
      renderHorizontalCut();
    }
  }

  el.btnApplyCustomLines.addEventListener('click', applyCustomPeriods);
  el.customPeriodsInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') applyCustomPeriods();
  });

  // Red-noise MC chips
  if (el.chipsMC) {
    el.chipsMC.forEach((chip) => {
      chip.addEventListener('click', () => {
        const val = parseInt(chip.dataset.mc);
        state.n_mc = val;
        if (el.mcSlider) {
          if (val > parseInt(el.mcSlider.max)) el.mcSlider.max = val;
          el.mcSlider.value = val;
        }
        if (el.mcInput) el.mcInput.value = val;
        el.chipsMC.forEach(c => c.classList.toggle('active', parseInt(c.dataset.mc) === val));
      });
    });
  }

  if (el.mcInput) {
    el.mcInput.addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      if (!isNaN(val) && val >= 10) {
        state.n_mc = val;
        if (el.mcSlider) el.mcSlider.value = Math.min(1000, val);
      }
    });
  }

  if (el.mcSlider) {
    el.mcSlider.addEventListener('input', (e) => {
      state.n_mc = parseInt(e.target.value);
      if (el.mcInput) el.mcInput.value = state.n_mc;
    });
  }

  // Colormap Select (preserve zoom in-place across Tab 3 and Tab 4)
  if (el.colormapSelect) {
    el.colormapSelect.addEventListener('change', (e) => {
      state.colormap = e.target.value;
      const { zmin, zmax } = getContrastRange();
      const cscale = getColormapScale(state.colormap);

      // Tab 3 Matrix restyle
      if (state.coherenceData && el.plotMatrix.data && el.plotMatrix.data.length > 0) {
        Plotly.restyle(el.plotMatrix, {
          colorscale: [cscale],
          zmin: zmin,
          zmax: zmax
        });
      }

      // Tab 4 Comparison Maps restyle
      if (state.comparisonData) {
        if (el.plotCompMapA && el.plotCompMapA.data && el.plotCompMapA.data.length > 0) {
          Plotly.restyle(el.plotCompMapA, { colorscale: [cscale], zmin: zmin, zmax: zmax });
        }
        if (el.plotCompMapB && el.plotCompMapB.data && el.plotCompMapB.data.length > 0) {
          Plotly.restyle(el.plotCompMapB, { colorscale: [cscale], zmin: zmin, zmax: zmax });
        }
      }
      showToast(`Palette switched to ${state.colormap}.`);
    });
  }

  // Contrast / Dynamic Range Select (preserve zoom in-place across Tab 3 and Tab 4)
  if (el.contrastSelect) {
    el.contrastSelect.addEventListener('change', (e) => {
      state.contrast = e.target.value;
      const { zmin, zmax } = getContrastRange();

      // Tab 3 Matrix restyle
      if (state.coherenceData && el.plotMatrix.data && el.plotMatrix.data.length > 0) {
        Plotly.restyle(el.plotMatrix, {
          zmin: zmin,
          zmax: zmax
        });
      }

      // Tab 4 Comparison Maps restyle
      if (state.comparisonData) {
        if (el.plotCompMapA && el.plotCompMapA.data && el.plotCompMapA.data.length > 0) {
          Plotly.restyle(el.plotCompMapA, { zmin: zmin, zmax: zmax });
        }
        if (el.plotCompMapB && el.plotCompMapB.data && el.plotCompMapB.data.length > 0) {
          Plotly.restyle(el.plotCompMapB, { zmin: zmin, zmax: zmax });
        }
      }
      showToast(`Contrast set to ${state.contrast} (z: ${zmin}–${zmax}).`);
    });
  }

  // Diagonal Masking Controls
  if (el.chkMaskDiagonal) {
    el.chkMaskDiagonal.addEventListener('change', (e) => {
      state.maskDiagonal = e.target.checked;
      if (el.maskWidthContainer) {
        el.maskWidthContainer.style.display = state.maskDiagonal ? 'flex' : 'none';
      }
      if (state.coherenceData) {
        renderMatrixPlot();
      }
      if (state.comparisonData) {
        renderComparisonView();
      }
      showToast(state.maskDiagonal ? 'Coronagraph active: Diagonal masked & palette dynamically recalibrated to off-diagonal features.' : 'Diagonal unmasked. Palette restored.');
    });
  }

  if (el.maskWidthSlider) {
    el.maskWidthSlider.addEventListener('input', (e) => {
      const factor = parseFloat(e.target.value);
      state.maskDiagonalWidthFactor = factor;
      if (el.maskWidthVal) el.maskWidthVal.textContent = factor.toFixed(2);
      if (state.maskDiagonal) {
        if (state.coherenceData) renderMatrixPlot();
        if (state.comparisonData) renderComparisonView();
      }
    });
  }

  // Horizontal Slices Display Mode (Single Cut vs Stacked Subpanels)
  if (el.btnHorizLayoutSingle) {
    el.btnHorizLayoutSingle.addEventListener('click', () => {
      state.horizLayout = 'single';
      el.btnHorizLayoutSingle.classList.add('active');
      if (el.btnHorizLayoutSubpanels) el.btnHorizLayoutSubpanels.classList.remove('active');
      if (el.selectSingleHorizCut) el.selectSingleHorizCut.style.display = 'inline-block';
      renderHorizontalCutsList();
      renderHorizontalCut();
    });
  }

  if (el.btnHorizLayoutSubpanels) {
    el.btnHorizLayoutSubpanels.addEventListener('click', () => {
      state.horizLayout = 'subpanels';
      el.btnHorizLayoutSubpanels.classList.add('active');
      if (el.btnHorizLayoutSingle) el.btnHorizLayoutSingle.classList.remove('active');
      if (el.selectSingleHorizCut) el.selectSingleHorizCut.style.display = 'none';
      renderHorizontalCutsList();
      renderHorizontalCut();
    });
  }

  if (el.selectSingleHorizCut) {
    el.selectSingleHorizCut.addEventListener('change', (e) => {
      state.selectedHorizCutId = e.target.value;
      const cut = (state.horizontalCuts || []).find(c => c.id === state.selectedHorizCutId);
      if (cut) {
        updateActiveSlice(state.activeF1 || cut.f2, cut.f2);
      }
      renderHorizontalCutsList();
      renderHorizontalCut();
    });
  }

  // Signal Guidelines Controls (View 1 & View 2)
  if (el.btnAddGuideline) {
    el.btnAddGuideline.addEventListener('click', addCustomGuideline);
  }
  if (el.inputGuidelineVal) {
    el.inputGuidelineVal.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addCustomGuideline();
    });
  }

  // Cut Slicing controls (Horizontal & Beat)
  document.querySelectorAll('[data-cut]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cut = btn.dataset.cut;
      const domain = btn.dataset.domain;
      const scale = btn.dataset.scale;

      const parent = btn.parentElement;
      parent.querySelectorAll(domain ? '.domain-btn' : '.scale-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      if (cut === 'horiz') {
        if (domain) state.horizDomain = domain;
        if (scale) state.horizYScale = scale;
        renderHorizontalCut();
      } else if (cut === 'beat') {
        if (domain) state.beatDomain = domain;
        if (scale) state.beatYScale = scale;
        renderAntiDiagonalCut();
      }
    });
  });

  el.btnCompute.addEventListener('click', runComputation);
  el.btnExportPNG.addEventListener('click', exportPNG);
  if (el.btnResetZoom) el.btnResetZoom.addEventListener('click', resetMatrixZoom);
  if (el.btnToggleFalContours) {
    el.btnToggleFalContours.addEventListener('click', () => {
      state.showFalContours = !state.showFalContours;
      el.btnToggleFalContours.textContent = state.showFalContours ? 'FAL Contours: ON' : 'FAL Contours: OFF';
      el.btnToggleFalContours.classList.toggle('active', state.showFalContours);
      renderMatrixPlot();
    });
  }
  if (el.btnExportHorizCSV) el.btnExportHorizCSV.addEventListener('click', () => exportCSV('horizontal'));
  if (el.btnExportBeatCSV) el.btnExportBeatCSV.addEventListener('click', () => exportCSV('antidiagonal'));

  // Granular Export Modal Event Listeners
  if (el.btnCloseExportModal) {
    el.btnCloseExportModal.addEventListener('click', closeExportModal);
  }
  if (el.btnCancelExport) {
    el.btnCancelExport.addEventListener('click', closeExportModal);
  }
  if (el.btnRunExport) {
    el.btnRunExport.addEventListener('click', runGranularExport);
  }

  window.addEventListener('resize', () => {
    if (state.activeView === 'dual2d' && state.coherenceData) {
      Plotly.Plots.resize(el.plotMatrix);
      Plotly.Plots.resize(el.plotHorizontal);
      Plotly.Plots.resize(el.plotAntiDiagonal);
    } else if (state.activeView === 'timeseries' && state.diagnosticsData) {
      Plotly.Plots.resize(el.plotTimeSeries);
      Plotly.Plots.resize(el.plotCadenceHist);
      Plotly.Plots.resize(el.plotSpectralWindow);
      Plotly.Plots.resize(el.plotLSSpectra);
    } else if (state.activeView === 'welch1d' && state.welch1DData) {
      Plotly.Plots.resize(el.plotSegmentTimeline);
      Plotly.Plots.resize(el.plotWelchPSD);
      Plotly.Plots.resize(el.plotWelch1DCoh);
    } else if (state.activeView === 'comparison' && state.comparisonData) {
      if (el.plotCompTimelineA) Plotly.Plots.resize(el.plotCompTimelineA);
      if (el.plotCompTimelineB) Plotly.Plots.resize(el.plotCompTimelineB);
      if (el.plotCompMapA) Plotly.Plots.resize(el.plotCompMapA);
      if (el.plotCompMapB) Plotly.Plots.resize(el.plotCompMapB);
      if (el.plotCompMapDelta) Plotly.Plots.resize(el.plotCompMapDelta);
      if (el.plotCompHorizSlice) Plotly.Plots.resize(el.plotCompHorizSlice);
      if (el.plotCompAntiDiagSlice) Plotly.Plots.resize(el.plotCompAntiDiagSlice);
      if (el.plotComp1DCohA) Plotly.Plots.resize(el.plotComp1DCohA);
      if (el.plotComp1DCohB) Plotly.Plots.resize(el.plotComp1DCohB);
    }
  });
}

document.addEventListener('DOMContentLoaded', initApp);
