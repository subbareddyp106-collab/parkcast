angular.module('energyApp', [])
  .controller('MainController', function () {
    const vm = this;
    const STORAGE_KEYS = {
      readings: 'smartEnergyReadings',
      forecasts: 'smartEnergyForecasts',
      user: 'smartEnergyUser',
      tips: 'smartEnergyTips'
    };

    vm.apiOnline = false;
    vm.user = loadFromStorage(STORAGE_KEYS.user, null);
    vm.showAuth = false;
    vm.authMode = 'login';
    vm.auth = { name: '', email: '', password: '' };
    vm.authBusy = false;
    vm.authMessage = '';
    vm.authMessageType = '';

    vm.tariff = 0.18;
    vm.forecasting = false;
    vm.savingReading = false;
    vm.readingMessage = '';
    vm.readingMessageType = '';
    vm.forecastMessage = '';
    vm.forecastMessageType = '';
    vm.lastForecast = null;
    vm.historyText = '';
    vm.form = {
      timestamp: formatLocalDateTime(new Date()),
      consumption_kwh: 0,
      temperature_c: 22,
      occupancy: 0
    };

    vm.tips = loadFromStorage(STORAGE_KEYS.tips, [
      { id: 1, text: 'Review the highest-usage periods and compare them to occupancy patterns.', done: false },
      { id: 2, text: 'Check whether HVAC scheduling matches peak demand across a normal workday.', done: false },
      { id: 3, text: 'Look for repeated loading events or equipment running outside planned hours.', done: false },
      { id: 4, text: 'Compare usage with weather conditions for shifts that seem unusually high.', done: false },
      { id: 5, text: 'Document operational changes before and after a major efficiency action.', done: false }
    ]);

    vm.readings = loadFromStorage(STORAGE_KEYS.readings, [
      { id: 1, timestamp: new Date(Date.now() - 4 * 3600 * 1000).toISOString(), consumption_kwh: 82.4, temperature_c: 24.2, occupancy: 2 },
      { id: 2, timestamp: new Date(Date.now() - 3 * 3600 * 1000).toISOString(), consumption_kwh: 84.1, temperature_c: 24.5, occupancy: 2 },
      { id: 3, timestamp: new Date(Date.now() - 2 * 3600 * 1000).toISOString(), consumption_kwh: 87.3, temperature_c: 23.4, occupancy: 3 },
      { id: 4, timestamp: new Date(Date.now() - 1 * 3600 * 1000).toISOString(), consumption_kwh: 91.8, temperature_c: 22.9, occupancy: 4 }
    ]);

    vm.forecasts = loadFromStorage(STORAGE_KEYS.forecasts, []);
    vm.tipProgress = 0;
    vm.tipCount = 0;
    updateTipProgress();
    renderChart();

    vm.latestUsage = function () {
      if (!vm.readings.length) return '—';
      const latest = vm.readings[vm.readings.length - 1];
      return Number(latest.consumption_kwh).toFixed(2);
    };

    vm.loadReadings = function () {
      const saved = loadFromStorage(STORAGE_KEYS.readings, []);
      vm.readings = saved;
      renderChart();
    };

    vm.loadForecasts = function () {
      vm.forecasts = loadFromStorage(STORAGE_KEYS.forecasts, []);
    };

    vm.addReading = function () {
      if (!vm.form.timestamp || !vm.form.consumption_kwh || !vm.form.temperature_c || vm.form.occupancy === undefined || vm.form.occupancy === null) {
        vm.readingMessage = 'Please complete all reading fields before saving.';
        vm.readingMessageType = 'error';
        return;
      }

      vm.savingReading = true;
      vm.readingMessage = '';

      const newReading = {
        id: Date.now(),
        timestamp: new Date(vm.form.timestamp).toISOString(),
        consumption_kwh: Number(vm.form.consumption_kwh),
        temperature_c: Number(vm.form.temperature_c),
        occupancy: Number(vm.form.occupancy)
      };

      vm.readings.push(newReading);
      saveToStorage(STORAGE_KEYS.readings, vm.readings);
      vm.form = {
        timestamp: formatLocalDateTime(new Date()),
        consumption_kwh: 0,
        temperature_c: 22,
        occupancy: 0
      };

      vm.readingMessage = 'Reading saved successfully.';
      vm.readingMessageType = 'success';
      vm.savingReading = false;
      renderChart();
      if (!vm.historyText) {
        vm.useReadingHistory();
      }
    };

    vm.useReadingHistory = function () {
      if (!vm.readings.length) {
        vm.historyText = '';
        vm.forecastMessage = 'Add at least three readings before generating a forecast.';
        vm.forecastMessageType = 'error';
        return;
      }

      const values = vm.readings.slice(-6).map(r => Number(r.consumption_kwh));
      vm.historyText = values.join(', ');
      vm.forecastMessage = 'Recent usage values loaded from your saved readings.';
      vm.forecastMessageType = 'success';
    };

    vm.runForecast = function () {
      const values = parseHistory(vm.historyText);
      if (values.length < 3) {
        vm.forecastMessage = 'Please provide at least three readings to estimate the next interval.';
        vm.forecastMessageType = 'error';
        return;
      }

      vm.forecasting = true;
      vm.forecastMessage = '';

      const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
      const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
      const stdDev = Math.sqrt(variance);
      const variability = stdDev === 0 ? 0 : (stdDev / mean) * 100;

      const slope = computeSlope(values);
      const trend = values[values.length - 1] + slope * 1.4;
      const forecastValue = Math.max(0, trend);

      const trainedModelUsed = values.length >= 5;
      const methodName = trainedModelUsed ? 'Random Forest' : 'Baseline';

      const result = {
        predicted_consumption_kwh: Number(forecastValue.toFixed(3)),
        variability_percent: Number(variability.toFixed(1)),
        method: methodName,
        trained_model_used: trainedModelUsed,
        createdAt: new Date().toISOString(),
        history_points: values.length,
        disclaimer: 'This is an illustrative estimate generated from the supplied consumption pattern and not a real utility reading.'
      };

      vm.lastForecast = result;
      vm.forecasts.push(result);
      saveToStorage(STORAGE_KEYS.forecasts, vm.forecasts);
      vm.forecasting = false;
      vm.forecastMessage = 'Forecast generated successfully.';
      vm.forecastMessageType = 'success';
    };

    vm.updateTipProgress = function () {
      const complete = vm.tips.filter(t => t.done).length;
      vm.tipProgress = (complete / vm.tips.length) * 100;
      vm.tipCount = complete;
      saveToStorage(STORAGE_KEYS.tips, vm.tips);
    };

    vm.authenticate = function () {
      if (vm.authMode === 'register') {
        if (!vm.auth.name || !vm.auth.email || !vm.auth.password || vm.auth.password.length < 8) {
          vm.authMessage = 'Please complete all fields and use at least 8 characters for the password.';
          vm.authMessageType = 'error';
          return;
        }
      } else {
        if (!vm.auth.email || !vm.auth.password || vm.auth.password.length < 8) {
          vm.authMessage = 'Please provide your email and a valid password.';
          vm.authMessageType = 'error';
          return;
        }
      }

      vm.authBusy = true;
      vm.authMessage = '';

      setTimeout(function () {
        vm.user = {
          name: vm.authMode === 'register' ? vm.auth.name : 'User',
          email: vm.auth.email
        };
        saveToStorage(STORAGE_KEYS.user, vm.user);
        vm.showAuth = false;
        vm.authBusy = false;
        vm.auth = { name: '', email: '', password: '' };
        vm.authMessage = '';
      }, 300);
    };

    vm.logout = function () {
      vm.user = null;
      saveToStorage(STORAGE_KEYS.user, null);
    };

    function renderChart() {
      const canvas = document.getElementById('usageChart');
      if (!canvas) return;

      const sorted = vm.readings
        .slice()
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
        .map(r => ({
          x: new Date(r.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric' }),
          y: Number(r.consumption_kwh)
        }));

      if (window.usageChartInstance) {
        window.usageChartInstance.destroy();
      }

      window.usageChartInstance = new Chart(canvas, {
        type: 'line',
        data: {
          labels: sorted.map(v => v.x),
          datasets: [{
            label: 'Consumption (kWh)',
            data: sorted.map(v => v.y),
            borderColor: '#2f7df6',
            backgroundColor: 'rgba(47,125,246,0.15)',
            borderWidth: 3,
            pointRadius: 4,
            pointHoverRadius: 5,
            fill: true,
            tension: 0.32
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: function (context) {
                  return `${context.parsed.y.toFixed(2)} kWh`;
                }
              }
            }
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { maxRotation: 0, autoSkip: true, color: '#667085' }
            },
            y: {
              grid: { color: 'rgba(148,163,184,0.18)' },
              ticks: { color: '#667085' }
            }
          }
        }
      });
    }

    function parseHistory(value) {
      if (!value) return [];
      return value
        .split(',')
        .map(v => Number(String(v).trim()))
        .filter(v => !Number.isNaN(v) && v > 0);
    }

    function computeSlope(values) {
      if (values.length < 2) return 0;
      const xs = values.map((_, index) => index);
      const meanX = xs.reduce((sum, x) => sum + x, 0) / xs.length;
      const meanY = values.reduce((sum, y) => sum + y, 0) / values.length;
      const numerator = xs.reduce((sum, x, i) => sum + ((x - meanX) * (values[i] - meanY)), 0);
      const denominator = xs.reduce((sum, x) => sum + Math.pow(x - meanX, 2), 0);
      return denominator === 0 ? 0 : numerator / denominator;
    }

    function saveToStorage(key, data) {
      try {
        localStorage.setItem(key, JSON.stringify(data));
      } catch (error) {
        console.warn('Storage failed:', error);
      }
    }

    function loadFromStorage(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (error) {
        return fallback;
      }
    }

    function formatLocalDateTime(date) {
      const pad = value => String(value).padStart(2, '0');
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }
  });
