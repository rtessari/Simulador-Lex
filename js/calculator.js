/**
 * Motor financeiro — Simulador de Financiamento Imobiliário
 * Exposto como window.Calc (IIFE, sem build tools necessário)
 */
(function (global) {
  'use strict';

  /**
   * Calcula a taxa combinada mensal (decimal) a partir de INCC + taxa fixa (em %)
   */
  function combinedRate(inccPct, fixedPct) {
    return (1 + inccPct / 100) * (1 + fixedPct / 100) - 1;
  }

  /**
   * Tabela Price — parcela mensal (PMT)
   * Se r = 0, retorna pv / n
   */
  function pricePayment(pv, r, n) {
    if (n <= 0) return 0;
    if (Math.abs(r) < 1e-10) return pv / n;
    return pv * r / (1 - Math.pow(1 + r, -n));
  }

  /**
   * Valida os parâmetros de entrada; retorna array de strings de erro (vazio = válido)
   */
  function validateInputs(params) {
    var errors = [];
    var v = params.totalValue;
    var e = params.entrada;
    var n = params.n;
    var incc = params.inccPct;
    var fixed = params.fixedPct;
    var rp = params.reforcoPeriodico;

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

    if (rp && rp.ativo) {
      if (!rp.intervalo || rp.intervalo <= 0 || !Number.isInteger(rp.intervalo))
        errors.push({ field: 'input-reforcoPeriodico-intervalo', msg: 'Intervalo de reforço deve ser um inteiro positivo' });
      if (rp.valor <= 0)
        errors.push({ field: 'input-reforcoPeriodico-valor', msg: 'Valor do reforço periódico deve ser positivo' });
    }

    return errors;
  }

  /**
   * Constrói a tabela de amortização completa.
   *
   * params: {
   *   totalValue: number,
   *   entrada: number,
   *   inccPct: number,
   *   fixedPct: number,
   *   n: number,
   *   reforcoPeriodico: { ativo, intervalo, valor, tipo: 'fixo'|'percentual' },
   *   reforcoManual: [{ mes, valor }, ...]
   * }
   *
   * Retorna: { schedule: Row[], summary: {} }
   */
  function buildSchedule(params) {
    var totalValue = params.totalValue;
    var entrada = params.entrada || 0;
    var incc = params.inccPct || 0;
    var fixed = params.fixedPct || 0;
    var n = params.n;
    var rp = params.reforcoPeriodico || { ativo: false };
    var rm = params.reforcoManual || [];

    var financedValue = totalValue - entrada;
    var r = combinedRate(incc, fixed);

    // Monta Map<mês → valor total de reforço>
    var reforcoMap = {};

    if (rp.ativo && rp.intervalo > 0) {
      var rpValor = rp.tipo === 'percentual'
        ? (rp.valor / 100) * financedValue
        : rp.valor;
      for (var m = rp.intervalo; m <= n; m += rp.intervalo) {
        reforcoMap[m] = (reforcoMap[m] || 0) + rpValor;
      }
    }

    rm.forEach(function (item) {
      if (item.mes > 0 && item.mes <= n && item.valor > 0) {
        reforcoMap[item.mes] = (reforcoMap[item.mes] || 0) + item.valor;
      }
    });

    var balance = financedValue;
    var pmt = pricePayment(balance, r, n);
    var schedule = [];
    var totalPmtPago = 0;
    var totalReforcoPago = 0;
    var totalJurosPago = 0;

    for (var month = 1; month <= n; month++) {
      if (balance < 0.005) break;

      var juros = balance * r;
      var amortizacao = pmt - juros;

      // Ajuste da última parcela ou quando amortização excede o saldo
      if (amortizacao > balance) {
        amortizacao = balance;
        pmt = amortizacao + juros;
      }

      balance -= amortizacao;
      balance = Math.round(balance * 100) / 100;

      var reforcoAmount = reforcoMap[month] || 0;
      if (reforcoAmount > balance) reforcoAmount = balance; // cap na quitação

      balance -= reforcoAmount;
      balance = Math.max(0, Math.round(balance * 100) / 100);

      schedule.push({
        month: month,
        pmt: pmt,
        juros: juros,
        amortizacao: amortizacao,
        reforcoAmount: reforcoAmount,
        balance: balance
      });

      totalPmtPago += pmt;
      totalReforcoPago += reforcoAmount;
      totalJurosPago += juros;

      // Recalcula PMT após reforço
      if (reforcoAmount > 0 && balance > 0.005 && month < n) {
        pmt = pricePayment(balance, r, n - month);
      }

      if (balance < 0.005) break;
    }

    var firstPmt = schedule.length > 0 ? schedule[0].pmt : 0;
    var totalPaid = totalPmtPago + totalReforcoPago;

    var summary = {
      totalValue: totalValue,
      entrada: entrada,
      financedValue: financedValue,
      inccPct: incc,
      fixedPct: fixed,
      rCombined: r,
      firstPmt: firstPmt,
      totalPmtPago: totalPmtPago,
      totalReforcoPago: totalReforcoPago,
      totalPaid: totalPaid,
      totalJuros: totalJurosPago,
      finalMonth: schedule.length > 0 ? schedule[schedule.length - 1].month : 0
    };

    return { schedule: schedule, summary: summary };
  }

  global.Calc = {
    combinedRate: combinedRate,
    pricePayment: pricePayment,
    validateInputs: validateInputs,
    buildSchedule: buildSchedule
  };

}(typeof window !== 'undefined' ? window : this));
