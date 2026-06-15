const KM_PER_DEGREE = 111;
const TARGET_SATURATION = 0.7;
const SWAP_ROUNDS = 200;
const REALLOC_ROUNDS = 100;

function calcDistance(x1, y1, x2, y2) {
  const dx = (x1 - x2) * KM_PER_DEGREE * 1000;
  const dy = (y1 - y2) * KM_PER_DEGREE * 1000;
  return Math.sqrt(dx * dx + dy * dy);
}

function formatDate(d) {
  const pad = (n) => String(n).padStart(2, "0");
  const date = d instanceof Date ? d : new Date(d);
  return (
    date.getFullYear() +
    "-" +
    pad(date.getMonth() + 1) +
    "-" +
    pad(date.getDate()) +
    " " +
    pad(date.getHours()) +
    ":" +
    pad(date.getMinutes()) +
    ":" +
    pad(date.getSeconds())
  );
}

function generateOrderNo(prefix) {
  const pad = (n) => String(n).padStart(2, "0");
  const d = new Date();
  const ts =
    d.getFullYear().toString().slice(-2) +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds());
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return (prefix || "ORD") + ts + rand;
}

function cloneFences(fences) {
  return fences.map((f) => ({
    ...f,
    surplus: f.currentCount - Math.floor(f.capacity * TARGET_SATURATION),
  }));
}

function getFenceAvailable(fence) {
  return Math.max(0, fence.capacity - fence.currentCount);
}

function greedyRebalance(fencesInput, illegalBikesInput) {
  const fences = cloneFences(fencesInput);
  const illegalBikes = illegalBikesInput.map((b) => ({ ...b }));
  const moves = [];
  let totalDistance = 0;

  for (let i = 0; i < illegalBikes.length; i++) {
    const bike = illegalBikes[i];
    let bestFence = null;
    let bestDist = Infinity;

    for (const f of fences) {
      if (getFenceAvailable(f) <= 0) continue;
      const d = calcDistance(bike.x, bike.y, f.centerX, f.centerY);
      if (d < bestDist) {
        bestDist = d;
        bestFence = f;
      }
    }

    if (bestFence) {
      moves.push({
        fromFenceId: null,
        toFenceId: bestFence.id,
        bikeIds: [bike.id],
        distance: bestDist,
      });
      bestFence.currentCount += 1;
      totalDistance += bestDist;
    }
  }

  const overflowFences = fences
    .filter((f) => f.currentCount > Math.floor(f.capacity * TARGET_SATURATION))
    .map((f) => ({ ...f }));

  overflowFences.sort((a, b) => b.surplus - a.surplus);

  for (const src of overflowFences) {
    const srcFence = fences.find((f) => f.id === src.id);
    let toMove =
      srcFence.currentCount - Math.floor(srcFence.capacity * TARGET_SATURATION);

    while (toMove > 0) {
      let bestFence = null;
      let bestDist = Infinity;

      for (const f of fences) {
        if (f.id === srcFence.id) continue;
        if (getFenceAvailable(f) <= 0) continue;
        const d = calcDistance(
          srcFence.centerX,
          srcFence.centerY,
          f.centerX,
          f.centerY,
        );
        if (d < bestDist) {
          bestDist = d;
          bestFence = f;
        }
      }

      if (!bestFence) break;

      const moveCount = Math.min(toMove, getFenceAvailable(bestFence));
      const assignedIds = [];
      for (let k = 0; k < moveCount; k++) assignedIds.push(null);

      moves.push({
        fromFenceId: srcFence.id,
        toFenceId: bestFence.id,
        bikeIds: assignedIds,
        distance: bestDist,
      });

      srcFence.currentCount -= moveCount;
      bestFence.currentCount += moveCount;
      toMove -= moveCount;
      totalDistance += bestDist * moveCount;
    }
  }

  return {
    moves,
    totalDistance,
  };
}

function buildSupplyDemand(fencesInput, illegalBikesInput) {
  const supplies = [];
  const demands = [];

  for (const bike of illegalBikesInput) {
    supplies.push({
      key: "illegal_" + bike.id,
      type: "illegal",
      id: null,
      bikeId: bike.id,
      x: bike.x,
      y: bike.y,
      amount: 1,
      fenceRef: null,
    });
  }

  for (const f of fencesInput) {
    const target = Math.floor(f.capacity * TARGET_SATURATION);
    const diff = f.currentCount - target;
    if (diff > 0) {
      supplies.push({
        key: "fence_sup_" + f.id,
        type: "fence",
        id: f.id,
        bikeId: null,
        x: f.centerX,
        y: f.centerY,
        amount: diff,
        fenceRef: f,
      });
    } else if (diff < 0) {
      demands.push({
        key: "fence_dem_" + f.id,
        id: f.id,
        x: f.centerX,
        y: f.centerY,
        amount: -diff,
        fenceRef: f,
      });
    }
  }

  return { supplies, demands };
}

function buildCostMatrix(supplies, demands) {
  const matrix = [];
  for (let i = 0; i < supplies.length; i++) {
    const row = [];
    for (let j = 0; j < demands.length; j++) {
      row.push(
        calcDistance(
          supplies[i].x,
          supplies[i].y,
          demands[j].x,
          demands[j].y,
        ),
      );
    }
    matrix.push(row);
  }
  return matrix;
}

function optimizedRebalance(fencesInput, illegalBikesInput) {
  const fences = cloneFences(fencesInput);
  const { supplies, demands } = buildSupplyDemand(fences, illegalBikesInput);

  if (supplies.length === 0 || demands.length === 0) {
    return {
      moves: [],
      totalDistance: 0,
    };
  }

  const costMatrix = buildCostMatrix(supplies, demands);
  const supplyRemaining = supplies.map((s) => s.amount);
  const demandRemaining = demands.map((d) => d.amount);

  const allocations = [];

  const supplyOrder = supplies
    .map((s, idx) => ({ idx, type: s.type, amount: s.amount }))
    .sort((a, b) => {
      if (a.type === "illegal" && b.type !== "illegal") return -1;
      if (a.type !== "illegal" && b.type === "illegal") return 1;
      return b.amount - a.amount;
    });

  for (const { idx: si } of supplyOrder) {
    if (supplyRemaining[si] <= 0) continue;

    const candidates = demands
      .map((d, dj) => ({
        dj,
        cost: costMatrix[si][dj],
        left: demandRemaining[dj],
      }))
      .filter((c) => c.left > 0)
      .sort((a, b) => a.cost - b.cost);

    for (const c of candidates) {
      if (supplyRemaining[si] <= 0) break;
      const take = Math.min(supplyRemaining[si], c.left);
      allocations.push({
        supplyIdx: si,
        demandIdx: c.dj,
        amount: take,
        cost: c.cost,
      });
      supplyRemaining[si] -= take;
      demandRemaining[c.dj] -= take;
    }
  }

  for (let round = 0; round < SWAP_ROUNDS; round++) {
    if (allocations.length < 2) break;

    const ai = Math.floor(Math.random() * allocations.length);
    let bi = Math.floor(Math.random() * allocations.length);
    if (ai === bi) continue;

    const a = allocations[ai];
    const b = allocations[bi];

    if (a.supplyIdx === b.supplyIdx || a.demandIdx === b.demandIdx) continue;

    const oldCost =
      a.cost * a.amount + b.cost * b.amount;

    const newA = allocations[ai];
    const newB = allocations[bi];

    const demandA = demands[a.demandIdx];
    const demandB = demands[b.demandIdx];
    const supplyA = supplies[a.supplyIdx];
    const supplyB = supplies[b.supplyIdx];

    const newACost = calcDistance(
      supplyA.x,
      supplyA.y,
      demandB.x,
      demandB.y,
    );
    const newBCost = calcDistance(
      supplyB.x,
      supplyB.y,
      demandA.x,
      demandA.y,
    );

    const newCost = newACost * a.amount + newBCost * b.amount;

    if (newCost < oldCost - 0.001) {
      newA.demandIdx = b.demandIdx;
      newA.cost = newACost;
      newB.demandIdx = a.demandIdx;
      newB.cost = newBCost;
    }
  }

  for (let round = 0; round < REALLOC_ROUNDS; round++) {
    let improved = false;

    for (let ai = 0; ai < allocations.length; ai++) {
      const a = allocations[ai];
      let bestImprovement = 0;
      let bestDemand = -1;
      let bestCost = 0;

      for (let dj = 0; dj < demands.length; dj++) {
        if (dj === a.demandIdx) continue;

        const supply = supplies[a.supplyIdx];
        const demand = demands[dj];
        const newC = calcDistance(supply.x, supply.y, demand.x, demand.y);
        const improvement = (a.cost - newC) * a.amount;

        if (improvement > bestImprovement + 0.001) {
          bestImprovement = improvement;
          bestDemand = dj;
          bestCost = newC;
        }
      }

      if (bestDemand >= 0) {
        a.demandIdx = bestDemand;
        a.cost = bestCost;
        improved = true;
      }
    }

    if (!improved) break;
  }

  const moves = [];
  let totalDistance = 0;

  for (const alloc of allocations) {
    const supply = supplies[alloc.supplyIdx];
    const demand = demands[alloc.demandIdx];

    if (supply.type === "illegal") {
      const bikeIds = [];
      for (let k = 0; k < alloc.amount; k++) {
        bikeIds.push(supply.bikeId);
      }
      moves.push({
        fromFenceId: null,
        toFenceId: demand.id,
        bikeIds,
        distance: alloc.cost,
      });
      totalDistance += alloc.cost * alloc.amount;
    } else {
      const bikeIds = [];
      for (let k = 0; k < alloc.amount; k++) {
        bikeIds.push(null);
      }
      moves.push({
        fromFenceId: supply.id,
        toFenceId: demand.id,
        bikeIds,
        distance: alloc.cost,
      });
      totalDistance += alloc.cost * alloc.amount;
    }
  }

  return {
    moves,
    totalDistance,
  };
}

function runRebalance(fences, illegalBikes) {
  const greedyResult = greedyRebalance(fences, illegalBikes);
  const optimizedResult = optimizedRebalance(fences, illegalBikes);

  const greedyDistance = greedyResult.totalDistance;
  const totalDistance = optimizedResult.totalDistance;
  const distanceSaved = Math.max(0, greedyDistance - totalDistance);

  return {
    moves: optimizedResult.moves,
    totalDistance,
    greedyDistance,
    distanceSaved,
  };
}

module.exports = {
  calcDistance,
  formatDate,
  generateOrderNo,
  greedyRebalance,
  optimizedRebalance,
  runRebalance,
};
