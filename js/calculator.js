/**
 * Motor financeiro — Simulador de Financiamento Imobiliário
 * Exposto como window.Calc (IIFE, sem build tools necessário)
 */
(function (global) {
  'use strict';

  function combinedRate(inccPct, fixedPct) {
    return (1 + inccPct / 100) * (1 + fixedPct / 100) - 1;
  }

  /** Tabela Price — PMT. Se r = 0, retorna pv / n */
  function pricePayment(pv, r, n) {
    if (n <= 0) return 0;
    if (Math.abs(r) < 1e-10) return pv / n;
    return pv * r / (1 - Math.pow(1 + r, -n));
  }

  function validateInputs(params) {
    var errors = [];
    var v     = params.totalValue;
    var e     = params.entrada;
    var n     = params.n;
    var nObra = params.nObra;
    var incc  = params.inccPct;
    var fixed = params.fixedPct;
    var rp    = params.reforcoPeriodico;

    if (!v || v <= 0)
      errors.push({ field: 'input-valor-imovel', msg: 'Valor do imóvel deve ser positivo' });
    if (e < 0)
      errors.push({ field: 'input-entrada', msg: 'Entrada não pode ser negativa' });
    if (v > 0 && e >= v)
      errors.push({ field: 'input-entrada', msg: 'Entrada deve ser menor que o valor do imóvel' });
    if (incc < 0)
      errors.push({ field: 'input-taxa-incc', msg: 'Taxa INCC não pode ser negativa' });
    if (fixed < 0)
      errors.push({ field: 'input-taxa-fixa', msg: 'Taxa Fixa não pode ser negativa' });
    if (!n || n <= 0 || !Number.isInteger(n))
      errors.push({ field: 'input-parcelas', msg: 'Número de parcelas deve ser um inteiro positivo' });
    if (n > 600)
      errors.push({ field: 'input-parcelas', msg: 'Máximo de 600 parcelas (50 anos)' });
    if (nObra > 0) {
      if (!Number.isInteger(nObra))
        errors.push({ field: 'input-n-obra', msg: 'Parcelas de obra deve ser um inteiro' });
      else if (n > 0 && nObra >= n)
        errors.push({ field: 'input-n-obra', msg: 'Parcelas de obra deve ser menor que o total de parcelas' });
    }
    if (rp && rp.ativo) {
      if (!rp.intervalo || rp.intervalo <= 0 || !Number.isInteger(rp.intervalo))
        errors.push({ field: 'input-reforcoPeriodico-intervalo', msg: 'Intervalo de reforço deve ser um inteiro positivo' });
      if (rp.valor <= 0)
        errors.push({ field: 'input-reforcoPeriodico-valor', msg: 'Valor do reforço periódico deve ser positivo' });
    }

    return errors;
  }

  /**
   * Constrói a tabela de amortização.
   *
   * Fase 1 (meses 1..nObra)   → taxa = INCC apenas
   * Fase 2 (meses nObra+1..n) → taxa = INCC + Taxa Fixa (combinada)
   * Se nObra = 0, todos os meses usam a taxa combinada.
   *
   * sistemas suportados: 'price' | 'sac'
   *
   * SAC: amortização constante = balance_inicial_do_período / meses_restantes.
   *      Após reforço, amortização é recalculada para os meses restantes.
   * Price: PMT constante; recalculado na transição de fase e após reforços.
   */
  function buildSchedule(params) {
    var totalValue = params.totalValue;
    var entrada    = params.entrada    || 0;
    var incc       = params.inccPct    || 0;
    var fixed      = params.fixedPct   || 0;
    var n          = params.n;
    var nObra      = params.nObra      || 0;
    var sistema    = params.sistema    || 'price';
    var rp         = params.reforcoPeriodico || { ativo: false };
    var rm         = params.reforcoManual    || [];

    var financedValue = totalValue - entrada;
    var r1 = incc / 100;                  // fase 1: só INCC
    var r2 = combinedRate(incc, fixed);   // fase 2: combinada

    // Map<mês → reforço total>
    var reforcoMap = {};
    if (rp.ativo && rp.intervalo > 0) {
      var rpValor = rp.tipo === 'percentual' ? (rp.valor / 100) * financedValue : rp.valor;
      for (var m = rp.intervalo; m <= n; m += rp.intervalo)
        reforcoMap[m] = (reforcoMap[m] || 0) + rpValor;
    }
    rm.forEach(function (item) {
      if (item.mes > 0 && item.mes <= n && item.valor > 0)
        reforcoMap[item.mes] = (reforcoMap[item.mes] || 0) + item.valor;
    });

    var balance = financedValue;
    var schedule = [];
    var totalPmtPago = 0, totalReforcoPago = 0, totalJurosPago = 0;
    var pmtEntrega = null;

    // ── Price: PMT inicial ──────────────────────────────────────────────────
    var pmt = 0;
    if (sistema === 'price') {
      var r_init = (nObra > 0 && nObra < n) ? r1 : r2;
      pmt = pricePayment(balance, r_init, n);
    }

    // ── SAC: amortização constante inicial ──────────────────────────────────
    var sacAmort = (sistema === 'sac') ? balance / n : 0;

    for (var month = 1; month <= n; month++) {
      if (balance < 0.005) break;

      var r_current = (nObra > 0 && month <= nObra) ? r1 : r2;
      var fase      = (nObra > 0 && month <= nObra) ? 'obra' : 'entrega';

      // Transição de fase: recalcula PMT (Price) — SAC só muda a taxa
      if (nObra > 0 && month === nObra + 1) {
        if (sistema === 'price') {
          pmt = pricePayment(balance, r2, n - nObra);
          pmtEntrega = pmt;
        }
      }

      var juros, amortizacao, parcela;

      if (sistema === 'sac') {
        amortizacao = Math.min(sacAmort, balance);
        juros       = balance * r_current;
        parcela     = amortizacao + juros;
      } else {
        juros       = balance * r_current;
        amortizacao = pmt - juros;
        if (amortizacao > balance) { amortizacao = balance; pmt = amortizacao + juros; }
        parcela = pmt;
      }

      balance -= amortizacao;
      balance = Math.round(balance * 100) / 100;

      var reforcoAmount = reforcoMap[month] || 0;
      if (reforcoAmount > balance) reforcoAmount = balance;
      balance -= reforcoAmount;
      balance = Math.max(0, Math.round(balance * 100) / 100);

      schedule.push({
        month: month,
        fase: fase,
        pmt: parcela,
        juros: juros,
        amortizacao: amortizacao,
        reforcoAmount: reforcoAmount,
        balance: balance
      });

      totalPmtPago     += parcela;
      totalReforcoPago += reforcoAmount;
      totalJurosPago   += juros;

      // Recálculo após reforço
      if (reforcoAmount > 0 && balance > 0.005 && month < n) {
        var remaining = n - month;
        if (sistema === 'sac') {
          sacAmort = balance / remaining;
        } else {
          var r_fase = (nObra > 0 && month < nObra) ? r1 : r2;
          pmt = pricePayment(balance, r_fase, remaining);
          if (fase === 'entrega' && pmtEntrega === null) pmtEntrega = pmt;
        }
      }

      // SAC: captura pmtEntrega na transição de fase
      if (sistema === 'sac' && nObra > 0 && month === nObra && pmtEntrega === null) {
        // primeira parcela pós-obra = amort + juros na taxa r2
        var nextAmort = sacAmort;
        pmtEntrega = nextAmort + balance * r2;
      }

      if (balance < 0.005) break;
    }

    var firstPmt  = schedule.length > 0 ? schedule[0].pmt : 0;
    var lastPmt   = schedule.length > 0 ? schedule[schedule.length - 1].pmt : 0;
    var totalPaid = totalPmtPago + totalReforcoPago;
    if (pmtEntrega === null) pmtEntrega = firstPmt;

    var summary = {
      totalValue:       totalValue,
      entrada:          entrada,
      financedValue:    financedValue,
      inccPct:          incc,
      fixedPct:         fixed,
      rCombined:        r2,
      sistema:          sistema,
      nObra:            nObra,
      pmtObra:          nObra > 0 ? firstPmt : null,
      pmtEntrega:       pmtEntrega,
      firstPmt:         firstPmt,
      lastPmt:          lastPmt,
      totalPmtPago:     totalPmtPago,
      totalReforcoPago: totalReforcoPago,
      totalPaid:        totalPaid,
      totalJuros:       totalJurosPago,
      finalMonth:       schedule.length > 0 ? schedule[schedule.length - 1].month : 0
    };

    return { schedule: schedule, summary: summary };
  }

  global.Calc = {
    combinedRate:   combinedRate,
    pricePayment:   pricePayment,
    validateInputs: validateInputs,
    buildSchedule:  buildSchedule
  };

}(typeof window !== 'undefined' ? window : this));
