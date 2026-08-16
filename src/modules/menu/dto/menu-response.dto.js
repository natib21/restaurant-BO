function attachMenuItemImage(item, req) {
  return {
    ...(item.toObject ? item.toObject() : item),
    image: item.image ? `${req.protocol}s://${req.get('host')}/img/menu/${item.image}` : null,
  };
}

function attachMenuItemImageStandard(item, req) {
  return {
    ...(item.toObject ? item.toObject() : item),
    image: item.image ? `${req.protocol}://${req.get('host')}/img/menu/${item.image}` : null,
  };
}

function attachComboImage(comboObj, req) {
  return {
    ...comboObj,
    image: comboObj.image
      ? `${req.protocol}://${req.get('host')}/img/combo/${comboObj.image}`
      : null,
  };
}

function attachMenuGroupImages(menuGroup, req) {
  return {
    ...menuGroup,
    bannerImage: menuGroup.bannerImage
      ? `${req.protocol}://${req.get('host')}/img/menu-groups/${menuGroup.bannerImage}`
      : null,
    items: menuGroup.items.map(item => ({
      ...item,
      menu: item.menu
        ? {
            ...item.menu,
            image: item.menu.image
              ? `${req.protocol}://${req.get('host')}/img/menu/${item.menu.image}`
              : null,
          }
        : null,
    })),
  };
}

module.exports = {
  attachMenuItemImage,
  attachMenuItemImageStandard,
  attachComboImage,
  attachMenuGroupImages,
};
