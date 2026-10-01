function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function indexCategories(categories) {
  const links = new Map();
  const categoriesByName = new Map();
  const duplicateIds = new Set();
  for (let categoryIndex = 0; categoryIndex < (categories || []).length; categoryIndex++) {
    const category = categories[categoryIndex];
    const linkIds = [];
    for (let index = 0; index < category.links.length; index++) {
      const link = category.links[index];
      linkIds.push(link.id);
      if (links.has(link.id)) duplicateIds.add(link.id);
      links.set(link.id, {
        id: link.id,
        url: link.url,
        description: link.description,
        category: category.name,
        position: index
      });
    }
    categoriesByName.set(category.name, {
      name: category.name,
      position: categoryIndex,
      linkIds
    });
  }
  return { links, categoriesByName, duplicateIds };
}

function sameLink(a, b) {
  return a?.url === b?.url &&
    a?.description === b?.description &&
    a?.category === b?.category &&
    a?.position === b?.position;
}

function valueForChoice(value) {
  return value === undefined ? '(deleted)' : String(value);
}

function sameCategory(a, b) {
  return a?.position === b?.position &&
    JSON.stringify(a?.linkIds) === JSON.stringify(b?.linkIds);
}

export function mergeLinks(baseCategories, currentCategories, otherCategories) {
  const base = indexCategories(baseCategories);
  const current = indexCategories(currentCategories);
  const other = indexCategories(otherCategories);
  const conflicts = [];
  const merged = new Map();
  const mergedCategories = new Map();
  const excludedCategories = new Set();

  function conflict(label, baseValue, currentValue, otherValue, apply) {
    const index = conflicts.length;
    conflicts.push({
      id: `links-${index}`,
      label,
      base: valueForChoice(baseValue),
      current: valueForChoice(currentValue),
      other: valueForChoice(otherValue),
      resolution: currentValue === undefined ? '' : String(currentValue),
      resolved: false,
      apply
    });
  }

  for (const name of new Set([
    ...base.categoriesByName.keys(),
    ...current.categoriesByName.keys(),
    ...other.categoriesByName.keys()
  ])) {
    const baseCategory = base.categoriesByName.get(name);
    const currentCategory = current.categoriesByName.get(name);
    const otherCategory = other.categoriesByName.get(name);

    if (!baseCategory) {
      const entry = clone(currentCategory || otherCategory);
      if (currentCategory && otherCategory) {
        if (currentCategory.position === otherCategory.position) {
          entry.position = currentCategory.position;
        } else {
          entry.position = currentCategory.position;
          conflict(
            `Order for category ${name}`,
            undefined,
            currentCategory.position,
            otherCategory.position,
            (value) => { entry.position = Number(value); }
          );
        }
      }
      mergedCategories.set(name, entry);
      continue;
    }

    if (!currentCategory && !otherCategory) continue;
    if (!currentCategory || !otherCategory) {
      const survivor = currentCategory || otherCategory;
      if (sameCategory(baseCategory, survivor)) continue;
      const currentIsDeleted = !currentCategory;
      const entry = clone(survivor);
      mergedCategories.set(name, entry);
      conflict(
        `Delete versus change for category ${name}`,
        'keep',
        currentIsDeleted ? 'delete' : 'keep',
        currentIsDeleted ? 'keep' : 'delete',
        (value) => {
          if (value.trim().toLowerCase() === 'delete') {
            mergedCategories.delete(name);
            excludedCategories.add(name);
          } else {
            mergedCategories.set(name, entry);
            excludedCategories.delete(name);
          }
        }
      );
      continue;
    }

    const entry = clone(currentCategory);
    if (currentCategory.position === otherCategory.position) {
      entry.position = currentCategory.position;
    } else if (currentCategory.position === baseCategory.position) {
      entry.position = otherCategory.position;
    } else if (otherCategory.position === baseCategory.position) {
      entry.position = currentCategory.position;
    } else {
      conflict(
        `Order for category ${name}`,
        baseCategory.position,
        currentCategory.position,
        otherCategory.position,
        (value) => { entry.position = Number(value); }
      );
    }
    mergedCategories.set(name, entry);
  }

  for (const id of new Set([
    ...base.links.keys(),
    ...current.links.keys(),
    ...other.links.keys()
  ])) {
    const baseLink = base.links.get(id);
    const currentLink = current.links.get(id);
    const otherLink = other.links.get(id);

    if (!baseLink) {
      if (currentLink && otherLink && !sameLink(currentLink, otherLink)) {
        const entry = clone(currentLink);
        merged.set(id, entry);
        for (const field of ['url', 'description', 'category', 'position']) {
          if (currentLink[field] !== otherLink[field]) {
            conflict(`${field} for ${currentLink.url || otherLink.url}`, undefined, currentLink[field], otherLink[field],
              (value) => { entry[field] = field === 'position' ? Number(value) : value; });
          }
        }
      } else {
        merged.set(id, clone(currentLink || otherLink));
      }
      continue;
    }

    if (!currentLink && !otherLink) continue;
    if (!currentLink || !otherLink) {
      const survivor = currentLink || otherLink;
      const survivorChanged = !sameLink(baseLink, survivor);
      if (!survivorChanged) continue;
      const currentIsDeleted = !currentLink;
      const entry = clone(survivor);
      merged.set(id, entry);
      conflict(
        `Delete versus edit for ${survivor.url}`,
        'keep',
        currentIsDeleted ? 'delete' : 'keep',
        currentIsDeleted ? 'keep' : 'delete',
        (value) => {
          if (value.trim().toLowerCase() === 'delete') merged.delete(id);
          else merged.set(id, entry);
        }
      );
      continue;
    }

    const entry = { id };
    merged.set(id, entry);
    for (const field of ['url', 'description', 'category', 'position']) {
      const baseValue = baseLink[field];
      const currentValue = currentLink[field];
      const otherValue = otherLink[field];
      if (currentValue === otherValue) {
        entry[field] = currentValue;
      } else if (currentValue === baseValue) {
        entry[field] = otherValue;
      } else if (otherValue === baseValue) {
        entry[field] = currentValue;
      } else {
        entry[field] = currentValue;
        const readableField = field === 'position' ? 'Order' : `${field[0].toUpperCase()}${field.slice(1)}`;
        conflict(`${readableField} for ${currentLink.url || otherLink.url}`, baseValue, currentValue, otherValue,
          (value) => { entry[field] = field === 'position' ? Number(value) : value; });
      }
    }
  }

  for (const duplicateId of new Set([...current.duplicateIds, ...other.duplicateIds])) {
    conflict(`Duplicate stable link ID ${duplicateId}`, 'unique ID', duplicateId, duplicateId, () => {});
  }

  const assemble = (resolutions = conflicts) => {
    resolutions.forEach((resolution, index) => {
      conflicts[index].apply(resolution.resolution);
    });
    const grouped = new Map(
      [...mergedCategories.keys()].map((name) => [name, []])
    );
    for (const link of merged.values()) {
      if (excludedCategories.has(link.category)) continue;
      if (!grouped.has(link.category)) grouped.set(link.category, []);
      grouped.get(link.category).push({
        id: link.id,
        url: link.url,
        description: link.description,
        position: Number.isFinite(link.position) ? link.position : Number.MAX_SAFE_INTEGER
      });
    }
    return [...grouped.entries()]
      .sort(([a], [b]) => {
        const ai = mergedCategories.get(a)?.position ?? Number.MAX_SAFE_INTEGER;
        const bi = mergedCategories.get(b)?.position ?? Number.MAX_SAFE_INTEGER;
        return ai - bi || a.localeCompare(b);
      })
      .map(([name, links]) => ({
        name,
        links: links
          .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
          .map(({ position, ...link }) => link)
      }));
  };

  return {
    conflicts,
    categories: conflicts.length ? null : assemble(),
    assemble
  };
}
