(function () {
  'use strict';

  // ── State ───────────────────────────────────────────────────────────────────
  var lastSchedule = null;
  var chart = null;
  var currentPage = 0;
  var pageSize = 50;

  // ── Init ────────────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    bindEvents();
    updateTaxaPreview();
    updateReforcoPeriodicoState();
    updateReforcoManualTable();
  });

  // ── Event Binding ────────────────────────────────────────────────────────────
  function bindEvents() {
    document.getElementById('btn-calcular').addEventListener('click', onCalculate);

    document.getElementById('input-taxa-incc').addEventListener('input', updateTaxaPreview);
    document.getElementById('input-taxa-fixa').addEventListener('input', updateTaxaPreview);

    document.getElementById('checkbox-reforcoPeriodico-ativo').addEventListener('change', updateReforcoPeriodicoState);

    document.getElementById('select-reforcoPeriodico-tipo').addEventListener('change', function () {
      var prefix = document.getElementById('reforco-prefix');
      prefix.textContent = this.value === 'percentual' ? '%' : 'R$';
      document.getElementById('input-reforcoPeriodico-valor').placeholder =
        this.value === 'percentual' ? '5' : '10.000';
    });

    document.getElementById('btn-addReforco').addEventListener('click', addReforcoManualRow);

    document.getElementById('btn-prev-page').addEventListener('click', function () {
      if (currentPage > 0) {
        currentPage--;
        renderTablePage(lastSchedule, currentPage, pageSize);
        updatePaginationControls(lastSchedule.length, currentPage, pageSize);
      }
    });

    document.getElementById('btn-next-page').addEventListener('click', function () {
      if ((currentPage + 1) * pageSize < lastSchedule.length) {
        currentPage++;
        renderTablePage(lastSchedule, currentPage, pageSize);
        updatePaginationControls(lastSchedule.length, currentPage, pageSize);
      }
    });

    document.getElementById('sel-page-size').addEventListener('change', function () {
      pageSize = parseInt(this.value, 10) || lastSchedule.length;
      currentPage = 0;
      renderTablePage(lastSchedule, currentPage, pageSize);
      updatePaginationControls(lastSchedule.length, currentPage, pageSize);
    });
  }

  // ── Taxa Combinada Preview ───────────────────────────────────────────────────
  function updateTaxaPreview() {
    var incc = parseFloatSafe(document.getElementById('input-taxa-incc').value);
    var fixed = parseFloatSafe(document.getElementById('input-taxa-fixa').value);
    var preview = document.getElementById('taxa-combinada-preview');
    var valor = document.getElementById('taxa-combinada-valor');

    if (incc > 0 || fixed > 0) {
      var r = Calc.combinedRate(incc, fixed);
      valor.textContent = fmtPct(r * 100, 4) + ' a.m. (' + fmtPct(annualize(r) * 100, 2) + ' a.a.)';
      preview.hidden = false;
    } else {
      preview.hidden = true;
    }
  }

  function annualize(r) {
    return Math.pow(1 + r, 12) - 1;
  }

  // ── Reforço Periódico Toggle ─────────────────────────────────────────────────
  function updateReforcoPeriodicoState() {
    var ativo = document.getElementById('checkbox-reforcoPeriodico-ativo').checked;
    var fields = document.getElementById('reforco-periodico-fields');
    fields.classList.toggle('active', ativo);
  }

  // ── Reforço Manual CRUD ──────────────────────────────────────────────────────
  function addReforcoManualRow() {
    var tbody = document.getElementById('tbody-reforcoManual');
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td><input type="number" class="rm-mes" min="1" step="1" placeholder="Mês"></td>' +
      '<td><input type="number" class="rm-valor" min="0" step="100" placeholder="Valor R$"></td>' +
      '<td>' +
        '<button class="btn-delete-row" title="Remover">' +
          '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">' +
            '<path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
          '</svg>' +
        '</button>' +
      '</td>';

    tr.querySelector('.btn-delete-row').addEventListener('click', function () {
      tr.remove();
      updateReforcoManualTable();
    });

    tbody.appendChild(tr);
    updateReforcoManualTable();
    tr.querySelector('.rm-mes').focus();
  }

  function updateReforcoManualTable() {
    var tbody = document.getElementById('tbody-reforcoManual');
    var tbl = document.getElementById('tbl-reforcoManual');
    var empty = document.getElementById('reforco-manual-empty');
    var hasRows = tbody.querySelectorAll('tr').length > 0;
    tbl.classList.toggle('visible', hasRows);
    empty.style.display = hasRows ? 'none' : 'block';
  }

  function collectReforcoManual() {
    var rows = document.querySelectorAll('#tbody-reforcoManual tr');
    var result = [];
    rows.forEach(function (tr) {
      var mes = parseInt(tr.querySelector('.rm-mes').value, 10);
      var valor = parseFloatSafe(tr.querySelector('.rm-valor').value);
      if (mes > 0 && valor > 0) {
        result.push({ mes: mes, valor: valor });
      }
    });
    return result;
  }

  // ── Input Collection ──────────────────────────────────────────────────────────
  function collectInputs() {
    var ativo = document.getElementById('checkbox-reforcoPeriodico-ativo').checked;
    return {
      totalValue:  parseFloatSafe(document.getElementById('input-valor-imovel').value),
      entrada:     parseFloatSafe(document.getElementById('input-entrada').value),
      inccPct:     parseFloatSafe(document.getElementById('input-taxa-incc').value),
      fixedPct:    parseFloatSafe(document.getElementById('input-taxa-fixa').value),
      n:           parseInt(document.getElementById('input-parcelas').value, 10) || 0,
      nObra:       parseInt(document.getElementById('input-n-obra').value, 10) || 0,
      sistema:     document.querySelector('input[name="sistema"]:checked').value,
      reforcoPeriodico: {
        ativo:     ativo,
        intervalo: parseInt(document.getElementById('input-reforcoPeriodico-intervalo').value, 10) || 0,
        valor:     parseFloatSafe(document.getElementById('input-reforcoPeriodico-valor').value),
        tipo:      document.getElementById('select-reforcoPeriodico-tipo').value
      },
      reforcoManual: collectReforcoManual()
    };
  }

  // ── Validation UI ─────────────────────────────────────────────────────────────
  function showFieldErrors(errors) {
    errors.forEach(function (err) {
      var errEl = document.getElementById('err-' + err.field);
      var wrap = document.getElementById(err.field);
      if (errEl) { errEl.textContent = err.msg; errEl.classList.add('visible'); }
      if (wrap && wrap.closest('.input-wrap')) {
        wrap.closest('.input-wrap').classList.add('is-error');
      } else if (wrap) {
        var inputWrap = wrap.parentElement;
        if (inputWrap && inputWrap.classList.contains('input-wrap')) {
          inputWrap.classList.add('is-error');
        }
      }
    });
  }

  function clearFieldErrors() {
    document.querySelectorAll('.field-error').forEach(function (el) {
      el.textContent = '';
      el.classList.remove('visible');
    });
    document.querySelectorAll('.input-wrap.is-error').forEach(function (el) {
      el.classList.remove('is-error');
    });
  }

  // ── Calculate ─────────────────────────────────────────────────────────────────
  function onCalculate() {
    clearFieldErrors();
    var params = collectInputs();
    var errors = Calc.validateInputs(params);

    if (errors.length > 0) {
      showFieldErrors(errors);
      var firstField = document.getElementById(errors[0].field);
      if (firstField) firstField.focus();
      return;
    }

    var result = Calc.buildSchedule(params);
    lastSchedule = result.schedule;

    renderSummaryCards(result.summary);

    currentPage = 0;
    var pageSizeEl = document.getElementById('sel-page-size');
    pageSize = parseInt(pageSizeEl.value, 10) || lastSchedule.length;
    renderTablePage(lastSchedule, currentPage, pageSize);
    updatePaginationControls(lastSchedule.length, currentPage, pageSize);

    renderChart(lastSchedule);

    var resultsEl = document.getElementById('results');
    resultsEl.hidden = false;
    resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ── Summary Cards ─────────────────────────────────────────────────────────────
  function renderSummaryCards(s) {
    setCard('card-valor-imovel',    fmtBRL(s.totalValue));
    setCard('card-entrada',         fmtBRL(s.entrada));
    setCard('card-valor-financiado',fmtBRL(s.financedValue));
    setCard('card-taxa-incc',       fmtPct(s.inccPct, 4) + ' a.m.');
    setCard('card-taxa-fixa',       fmtPct(s.fixedPct, 4) + ' a.m.');
    setCard('card-taxa-combinada',  fmtPct(s.rCombined * 100, 4) + ' a.m.');
    setCard('card-total-reforcos',  fmtBRL(s.totalReforcoPago));
    setCard('card-total-juros',     fmtBRL(s.totalJuros));
    setCard('card-total-pagar',     fmtBRL(s.totalPaid + s.entrada));

    var cardEntrega  = document.getElementById('card-parcela-entrega');
    var cardUltima   = document.getElementById('card-ultima-parcela');
    var labelFirst   = document.getElementById('label-primeira-parcela');
    var isSac        = s.sistema === 'sac';

    // Label e valor da primeira parcela
    if (s.nObra > 0) {
      labelFirst.textContent = isSac ? '1ª Parcela de Obra (SAC)' : 'Parcela de Obra (fase 1)';
      setCard('card-primeira-parcela', fmtBRL(s.pmtObra));
      setCard('card-parcela-entrega',  fmtBRL(s.pmtEntrega));
      cardEntrega.hidden = false;
    } else {
      labelFirst.textContent = isSac ? '1ª Parcela (SAC)' : 'Primeira Parcela (PMT)';
      setCard('card-primeira-parcela', fmtBRL(s.firstPmt));
      cardEntrega.hidden = true;
    }

    // Última parcela — só relevante para SAC
    if (isSac) {
      setCard('card-ultima-parcela', fmtBRL(s.lastPmt));
      cardUltima.hidden = false;
    } else {
      cardUltima.hidden = true;
    }
  }

  function setCard(id, value) {
    var el = document.querySelector('#' + id + ' .card__value');
    if (el) el.textContent = value;
  }

  // ── Table Rendering ───────────────────────────────────────────────────────────
  function renderTablePage(schedule, page, size) {
    var tbody = document.getElementById('tbody-amortizacao');
    var start = page * size;
    var end = Math.min(start + size, schedule.length);
    var fragment = document.createDocumentFragment();

    tbody.innerHTML = '';

    for (var i = start; i < end; i++) {
      var row = schedule[i];

      // Linha separadora na transição obra → entrega
      var prevRow = schedule[i - 1];
      if (row.fase === 'entrega' && prevRow && prevRow.fase === 'obra') {
        var sep = document.createElement('tr');
        sep.classList.add('row--fase-separator');
        sep.innerHTML = '<td colspan="6">&#8595; Término da Obra — taxa fixa passa a incidir</td>';
        fragment.appendChild(sep);
      }

      var tr = document.createElement('tr');
      if (row.fase === 'obra')       tr.classList.add('row--obra');
      if (row.reforcoAmount > 0)     tr.classList.add('row--reforcado');

      tr.innerHTML =
        '<td>' + row.month + '</td>' +
        '<td>' + fmtBRL(row.pmt) + '</td>' +
        '<td>' + fmtBRL(row.amortizacao) + '</td>' +
        '<td>' + fmtBRL(row.juros) + '</td>' +
        '<td>' + (row.reforcoAmount > 0 ? fmtBRL(row.reforcoAmount) : '—') + '</td>' +
        '<td>' + fmtBRL(row.balance) + '</td>';

      fragment.appendChild(tr);
    }

    tbody.appendChild(fragment);
  }

  function updatePaginationControls(total, page, size) {
    var start = page * size + 1;
    var end = Math.min((page + 1) * size, total);
    var info = document.getElementById('tbl-pagination-info');
    info.textContent = 'Mostrando ' + start + '–' + end + ' de ' + total + ' parcelas';

    document.getElementById('btn-prev-page').disabled = (page === 0);
    document.getElementById('btn-next-page').disabled = ((page + 1) * size >= total);
  }

  // ── Chart ──────────────────────────────────────────────────────────────────────
  function destroyChart() {
    if (chart) { chart.destroy(); chart = null; }
  }

  function renderChart(schedule) {
    destroyChart();

    var labels = schedule.map(function (r) { return r.month; });
    var balanceData = schedule.map(function (r) { return r.balance; });
    var paidData = (function () {
      var cum = 0;
      return schedule.map(function (r) { cum += r.pmt + r.reforcoAmount; return cum; });
    }());

    var ctx = document.getElementById('chart-balance').getContext('2d');
    var sparse = schedule.length > 100;

    chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Saldo Devedor',
            data: balanceData,
            borderColor: '#1a3a5c',
            backgroundColor: 'rgba(26,58,92,0.08)',
            fill: true,
            tension: 0.3,
            pointRadius: sparse ? 0 : 3,
            pointHoverRadius: 5,
            borderWidth: 2
          },
          {
            label: 'Total Pago (acumulado)',
            data: paidData,
            borderColor: '#2ecc71',
            backgroundColor: 'rgba(46,204,113,0.06)',
            fill: true,
            tension: 0.3,
            pointRadius: sparse ? 0 : 3,
            pointHoverRadius: 5,
            borderWidth: 2,
            borderDash: [5, 3]
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            display: true,
            labels: { font: { size: 12 }, usePointStyle: true }
          },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                return ctx.dataset.label + ': ' + fmtBRL(ctx.raw);
              }
            }
          }
        },
        scales: {
          x: {
            title: { display: true, text: 'Mês', font: { size: 12 } },
            ticks: { maxTicksLimit: 12 }
          },
          y: {
            title: { display: true, text: 'Valor (R$)', font: { size: 12 } },
            ticks: {
              callback: function (v) {
                if (v >= 1000000) return 'R$ ' + (v / 1000000).toFixed(1) + 'M';
                if (v >= 1000) return 'R$ ' + (v / 1000).toFixed(0) + 'k';
                return 'R$ ' + v;
              }
            }
          }
        }
      }
    });
  }

  // ── Formatters ─────────────────────────────────────────────────────────────────
  function fmtBRL(value) {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  }

  function fmtPct(value, digits) {
    digits = digits !== undefined ? digits : 4;
    return value.toFixed(digits).replace('.', ',') + '%';
  }

  function parseFloatSafe(str) {
    var v = parseFloat(String(str).replace(',', '.'));
    return isNaN(v) ? 0 : v;
  }

}());
