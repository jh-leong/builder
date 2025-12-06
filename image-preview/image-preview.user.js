// ==UserScript==
// @name         图片放大预览
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  支持Alt+左键点击图片进行放大预览，支持触摸板双指放大、鼠标滚轮放大、拖拽、切换前后图片
// @author       You
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // 预览容器
  let previewContainer = null;
  let previewImage = null;
  let isPreviewOpen = false;
  let currentScale = 1;
  let currentTranslateX = 0;
  let currentTranslateY = 0;
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartTranslateX = 0;
  let dragStartTranslateY = 0;

  // 触摸相关
  let touchStartDistance = 0;
  let touchStartScale = 1;
  let touchStartCenterX = 0;
  let touchStartCenterY = 0;
  let isPinching = false;

  // 图片切换相关
  let currentImageIndex = -1;
  let imageList = []; // 当前窗口的图片列表
  let allImages = []; // 页面上所有图片的引用
  let thumbnailContainer = null;
  let prevButton = null;
  let nextButton = null;
  const WINDOW_SIZE = 5; // 前后各5张图片

  // 创建预览容器
  function createPreviewContainer() {
    const container = document.createElement('div');
    container.id = 'image-preview-container';
    container.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.9);
            z-index: 999999;
            display: none;
            align-items: center;
            justify-content: center;
            cursor: grab;
            user-select: none;
        `;

    const img = document.createElement('img');
    img.id = 'image-preview-img';
    img.style.cssText = `
            object-fit: contain;
            transition: transform 0.1s ease-out;
            transform-origin: center center;
            pointer-events: auto;
            cursor: grab;
        `;

    container.appendChild(img);

    // 创建缩略图容器
    thumbnailContainer = document.createElement('div');
    thumbnailContainer.id = 'image-preview-thumbnails';
    thumbnailContainer.style.cssText = `
            position: absolute;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            gap: 10px;
            max-width: 90%;
            overflow-x: auto;
            padding: 10px;
            background: rgba(0, 0, 0, 0.5);
            border-radius: 8px;
            z-index: 1000000;
        `;
    container.appendChild(thumbnailContainer);

    // 创建前后按钮
    prevButton = document.createElement('button');
    prevButton.style.cssText = `
            position: absolute;
            left: 20px;
            top: 50%;
            transform: translateY(-50%);
            width: 50px;
            height: 50px;
            border-radius: 50%;
            border: none;
            background: rgba(255, 255, 255, 0.2);
            cursor: pointer;
            z-index: 1000000;
            display: none;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
            padding: 0;
            margin: 0;
            backdrop-filter: blur(10px);
        `;
    // 使用CSS绘制左箭头
    prevButton.innerHTML = '';
    const prevArrow = document.createElement('div');
    prevArrow.style.cssText = `
            width: 0;
            height: 0;
            border-top: 8px solid transparent;
            border-bottom: 8px solid transparent;
            border-right: 12px solid white;
            margin-left: -2px;
        `;
    prevButton.appendChild(prevArrow);
    prevButton.addEventListener('mouseenter', () => {
      prevButton.style.background = 'rgba(255, 255, 255, 0.3)';
      prevButton.style.transform = 'translateY(-50%) scale(1.1)';
    });
    prevButton.addEventListener('mouseleave', () => {
      prevButton.style.background = 'rgba(255, 255, 255, 0.2)';
      prevButton.style.transform = 'translateY(-50%) scale(1)';
    });
    prevButton.addEventListener('click', (e) => {
      e.stopPropagation();
      navigateToPrevious();
    });
    container.appendChild(prevButton);

    nextButton = document.createElement('button');
    nextButton.style.cssText = `
            position: absolute;
            right: 20px;
            top: 50%;
            transform: translateY(-50%);
            width: 50px;
            height: 50px;
            border-radius: 50%;
            border: none;
            background: rgba(255, 255, 255, 0.2);
            cursor: pointer;
            z-index: 1000000;
            display: none;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
            padding: 0;
            margin: 0;
            backdrop-filter: blur(10px);
        `;
    // 使用CSS绘制右箭头
    nextButton.innerHTML = '';
    const nextArrow = document.createElement('div');
    nextArrow.style.cssText = `
            width: 0;
            height: 0;
            border-top: 8px solid transparent;
            border-bottom: 8px solid transparent;
            border-left: 12px solid white;
            margin-right: -2px;
        `;
    nextButton.appendChild(nextArrow);
    nextButton.addEventListener('mouseenter', () => {
      nextButton.style.background = 'rgba(255, 255, 255, 0.3)';
      nextButton.style.transform = 'translateY(-50%) scale(1.1)';
    });
    nextButton.addEventListener('mouseleave', () => {
      nextButton.style.background = 'rgba(255, 255, 255, 0.2)';
      nextButton.style.transform = 'translateY(-50%) scale(1)';
    });
    nextButton.addEventListener('click', (e) => {
      e.stopPropagation();
      navigateToNext();
    });
    container.appendChild(nextButton);

    document.body.appendChild(container);

    previewContainer = container;
    previewImage = img;

    // 点击蒙层关闭
    container.addEventListener('click', function (e) {
      if (e.target === container) {
        closePreview();
      }
    });

    // ESC键关闭，左右箭头键切换图片
    document.addEventListener('keydown', function (e) {
      if (!isPreviewOpen) return;

      if (e.key === 'Escape') {
        closePreview();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        navigateToPrevious();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        navigateToNext();
      }
    });

    // 鼠标滚轮缩放
    container.addEventListener('wheel', handleWheel, { passive: false });

    // 触摸事件
    container.addEventListener('touchstart', handleTouchStart, {
      passive: false,
    });
    container.addEventListener('touchmove', handleTouchMove, {
      passive: false,
    });
    container.addEventListener('touchend', handleTouchEnd, { passive: false });

    // 鼠标拖拽
    container.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    container.addEventListener('mouseleave', handleMouseUp);
  }

  // 查找页面上的所有图片
  function findAllImages() {
    const images = Array.from(document.querySelectorAll('img'));
    return images.filter((img) => {
      const src =
        img.src ||
        img.getAttribute('data-src') ||
        img.getAttribute('data-lazy-src');
      return src && src.trim() !== '';
    });
  }

  // 规范化URL，移除查询参数和hash以便比较
  function normalizeImageSrc(src) {
    if (!src) return '';
    try {
      const url = new URL(src);
      // 移除hash和某些查询参数，但保留重要的参数
      url.hash = '';
      // 移除可能变化的查询参数
      url.searchParams.delete('tp');
      url.searchParams.delete('wxfrom');
      url.searchParams.delete('wx_lazy');
      return url.toString();
    } catch (e) {
      // 如果不是完整URL，尝试简单处理
      const withoutHash = src.split('#')[0];
      return withoutHash.split('?')[0]; // 简单移除查询参数
    }
  }

  // 获取图片的src
  function getImageSrc(img) {
    return (
      img.src ||
      img.getAttribute('data-src') ||
      img.getAttribute('data-lazy-src') ||
      ''
    );
  }

  // 查找当前图片在列表中的索引（使用规范化URL比较）
  function findImageIndex(imgSrc) {
    const normalizedSrc = normalizeImageSrc(imgSrc);
    return allImages.findIndex((img) => {
      const imgSrcNormalized = normalizeImageSrc(getImageSrc(img));
      return imgSrcNormalized === normalizedSrc;
    });
  }

  // 查找当前图片附近的前后图片（懒加载）
  function findNearbyImages(currentSrc, windowSize = WINDOW_SIZE) {
    const currentIdx = findImageIndex(currentSrc);

    if (currentIdx === -1) {
      return [];
    }

    const startIdx = Math.max(0, currentIdx - windowSize);
    const endIdx = Math.min(allImages.length - 1, currentIdx + windowSize);

    const result = allImages.slice(startIdx, endIdx + 1).map((img) => ({
      element: img,
      src: getImageSrc(img),
      index: allImages.indexOf(img),
    }));

    return result;
  }

  // 更新缩略图显示
  function updateThumbnails() {
    if (!thumbnailContainer) {
      return;
    }

    // 清空现有缩略图
    thumbnailContainer.innerHTML = '';

    imageList.forEach((item, idx) => {
      const thumbnail = document.createElement('img');
      thumbnail.src = item.src;
      thumbnail.style.cssText = `
                width: 80px;
                height: 80px;
                object-fit: cover;
                border-radius: 4px;
                cursor: pointer;
                border: ${
                  idx === currentImageIndex
                    ? '3px solid white'
                    : '3px solid transparent'
                };
                opacity: ${idx === currentImageIndex ? '1' : '0.6'};
                transition: all 0.2s;
            `;
      thumbnail.addEventListener('mouseenter', () => {
        if (idx !== currentImageIndex) {
          thumbnail.style.opacity = '0.8';
        }
      });
      thumbnail.addEventListener('mouseleave', () => {
        if (idx !== currentImageIndex) {
          thumbnail.style.opacity = '0.6';
        }
      });
      thumbnail.addEventListener('click', (e) => {
        e.stopPropagation();
        navigateToImage(idx);
      });
      thumbnailContainer.appendChild(thumbnail);
    });

    // 显示/隐藏缩略图容器（只要有图片列表就显示）
    if (imageList.length > 0) {
      thumbnailContainer.style.display = 'flex';

      // 滚动到当前图片的缩略图
      if (
        currentImageIndex >= 0 &&
        currentImageIndex < thumbnailContainer.children.length
      ) {
        const currentThumbnail = thumbnailContainer.children[currentImageIndex];
        if (currentThumbnail) {
          currentThumbnail.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
            inline: 'center',
          });
        }
      }
    } else {
      thumbnailContainer.style.display = 'none';
    }
  }

  // 更新导航按钮显示
  function updateNavigationButtons() {
    if (!prevButton || !nextButton) return;

    const hasPrevious = currentImageIndex > 0;
    const hasNext = currentImageIndex < imageList.length - 1;

    prevButton.style.display = hasPrevious ? 'flex' : 'none';
    nextButton.style.display = hasNext ? 'flex' : 'none';
  }

  // 导航到指定图片
  function navigateToImage(index) {
    if (index < 0 || index >= imageList.length) return;

    currentImageIndex = index;
    const item = imageList[index];

    // 重置缩放和位置
    currentScale = 1.0; // 初始缩放为1.0，配合max-width/max-height使用
    currentTranslateX = 0;
    currentTranslateY = 0;

    // 加载新图片
    // 先清空src，避免显示旧图片
    previewImage.onload = null;
    previewImage.src = '';
    // 使用setTimeout确保清空操作完成后再设置新src
    setTimeout(() => {
      previewImage.src = item.src;
      
      // 等待图片加载完成后再更新约束和初始缩放
      if (previewImage.complete) {
        // 计算初始缩放，确保图片完整显示且周围至少保留20%黑边
        calculateInitialScale();
        updateTransform();
        constrainTranslate();
      } else {
        previewImage.onload = () => {
          // 计算初始缩放，确保图片完整显示且周围至少保留20%黑边
          calculateInitialScale();
          updateTransform();
          constrainTranslate();
          previewImage.onload = null; // 清理
        };
      }
    }, 0);

    // 更新UI
    updateThumbnails();
    updateNavigationButtons();

    // 滑动窗口：如果接近边界，加载更多图片
    updateImageWindow();
  }

  // 导航到上一张
  function navigateToPrevious() {
    if (currentImageIndex > 0) {
      navigateToImage(currentImageIndex - 1);
    }
  }

  // 导航到下一张
  function navigateToNext() {
    if (currentImageIndex < imageList.length - 1) {
      navigateToImage(currentImageIndex + 1);
    }
  }

  // 更新图片窗口（滑动窗口机制）
  function updateImageWindow() {
    if (imageList.length === 0) return;

    const currentItem = imageList[currentImageIndex];
    const currentGlobalIdx = currentItem.index;

    // 如果当前图片不在allImages中（index为-1），不需要更新窗口
    if (currentGlobalIdx === -1 || allImages.length === 0) {
      return;
    }

    // 检查是否需要扩展窗口
    const windowStart = Math.max(0, currentGlobalIdx - WINDOW_SIZE);
    const windowEnd = Math.min(
      allImages.length - 1,
      currentGlobalIdx + WINDOW_SIZE
    );

    // 如果当前窗口不够大，扩展它
    const currentWindowStart = imageList[0].index;
    const currentWindowEnd = imageList[imageList.length - 1].index;

    // 检查是否需要扩展窗口（接近边界时）
    if (currentWindowStart === -1 || currentWindowEnd === -1) {
      // 如果窗口中有无效索引，重新构建窗口
      const newImages = allImages
        .slice(windowStart, windowEnd + 1)
        .map((img) => ({
          element: img,
          src: getImageSrc(img),
          index: allImages.indexOf(img),
        }));

      imageList = newImages;
      currentImageIndex = imageList.findIndex(
        (item) => item.index === currentGlobalIdx
      );

      updateThumbnails();
      updateNavigationButtons();
    } else if (
      currentGlobalIdx - currentWindowStart < 2 ||
      currentWindowEnd - currentGlobalIdx < 2
    ) {
      // 需要扩展窗口
      const newImages = allImages
        .slice(windowStart, windowEnd + 1)
        .map((img) => ({
          element: img,
          src: getImageSrc(img),
          index: allImages.indexOf(img),
        }));

      imageList = newImages;
      currentImageIndex = imageList.findIndex(
        (item) => item.index === currentGlobalIdx
      );

      updateThumbnails();
      updateNavigationButtons();
    }
  }

  // 打开预览
  function openPreview(imgSrc, clickedImgElement = null) {
    if (!previewContainer) {
      createPreviewContainer();
    }

    // 懒加载：打开预览后再检索图片
    if (allImages.length === 0) {
      allImages = findAllImages();
    }

    // 查找当前图片附近的前后图片
    imageList = findNearbyImages(imgSrc, WINDOW_SIZE);

    // 找到当前图片在窗口中的索引（使用规范化URL比较）
    const normalizedImgSrc = normalizeImageSrc(imgSrc);
    currentImageIndex = imageList.findIndex(
      (item) => normalizeImageSrc(item.src) === normalizedImgSrc
    );

    if (currentImageIndex === -1) {
      // 如果没找到，添加当前图片到列表
      const currentIdx = findImageIndex(imgSrc);
      if (currentIdx !== -1) {
        imageList = [
          {
            element: allImages[currentIdx],
            src: imgSrc,
            index: currentIdx,
          },
        ];
        currentImageIndex = 0;
      } else {
        // 如果完全找不到，只显示当前图片
        imageList = [
          {
            element: clickedImgElement,
            src: imgSrc,
            index: -1,
          },
        ];
        currentImageIndex = 0;
      }
    }

    // 先清空src，避免显示旧图片
    previewImage.onload = null;
    previewImage.src = '';
    
    previewContainer.style.display = 'flex';
    isPreviewOpen = true;
    currentScale = 1.0; // 初始缩放为1.0，配合max-width/max-height使用
    currentTranslateX = 0;
    currentTranslateY = 0;

    // 使用setTimeout确保清空操作完成后再设置新src
    setTimeout(() => {
      previewImage.src = imgSrc;
      
      // 等待图片加载完成后再更新约束和初始缩放
      if (previewImage.complete) {
        // 计算初始缩放，确保图片完整显示且周围至少保留20%黑边
        calculateInitialScale();
        updateTransform();
        constrainTranslate();
      } else {
        previewImage.onload = () => {
          // 计算初始缩放，确保图片完整显示且周围至少保留20%黑边
          calculateInitialScale();
          updateTransform();
          constrainTranslate();
          previewImage.onload = null; // 清理
        };
      }
    }, 0);

    document.body.style.overflow = 'hidden';

    // 更新UI
    updateThumbnails();
    updateNavigationButtons();
  }

  // 关闭预览
  function closePreview() {
    if (previewContainer) {
      previewContainer.style.display = 'none';
      isPreviewOpen = false;
      currentScale = 1.0; // 重置为初始缩放
      currentTranslateX = 0;
      currentTranslateY = 0;
      document.body.style.overflow = '';
      // 不清空图片列表，保持状态以便下次快速打开
    }
  }

  // 更新变换
  function updateTransform() {
    if (previewImage) {
      const transformStr = `translate(${currentTranslateX}px, ${currentTranslateY}px) scale(${currentScale})`;
      previewImage.style.transform = transformStr;
    }
  }

  // 限制缩放范围（限制最大和最小缩放，防止图片缩小到看不见）
  function constrainScale(scale) {
    if (!previewImage || !previewImage.complete || previewImage.naturalWidth === 0) {
      return Math.min(scale, 5); // 如果图片未加载，只限制最大缩放
    }

    const containerRect = {
      width: window.innerWidth,
      height: window.innerHeight,
    };
    const naturalWidth = previewImage.naturalWidth;
    const naturalHeight = previewImage.naturalHeight;

    // 计算最小缩放：确保图片的宽度或高度至少占视窗的10%
    // 这样即使缩小到最小，图片仍然可见
    const minDisplayWidth = containerRect.width * 0.1;
    const minDisplayHeight = containerRect.height * 0.1;
    const minWidthRatio = minDisplayWidth / naturalWidth;
    const minHeightRatio = minDisplayHeight / naturalHeight;
    const minScale = Math.max(minWidthRatio, minHeightRatio);

    // 限制在最小和最大缩放之间
    return Math.max(minScale, Math.min(scale, 5));
  }

  // 计算初始缩放，确保图片完整显示，周围保留至少20%视窗宽度的黑边
  function calculateInitialScale() {
    if (
      !previewImage ||
      !previewImage.complete ||
      previewImage.naturalWidth === 0
    ) {
      return;
    }

    const containerRect = {
      width: window.innerWidth,
      height: window.innerHeight,
    };
    const naturalWidth = previewImage.naturalWidth;
    const naturalHeight = previewImage.naturalHeight;

    // 计算可用显示尺寸（左右各20%，上下各20%）
    // 可用宽度 = 视窗宽度 * (1 - 0.2 * 2) = 视窗宽度 * 0.6
    // 可用高度 = 视窗高度 * (1 - 0.2 * 2) = 视窗高度 * 0.6
    const maxDisplayWidth = containerRect.width * 0.6;
    const maxDisplayHeight = containerRect.height * 0.6;

    // 计算保持宽高比的最大缩放比例
    // 确保图片完整显示在可用区域内，选择较小的缩放比例
    const widthRatio = maxDisplayWidth / naturalWidth;
    const heightRatio = maxDisplayHeight / naturalHeight;
    const maxRatio = Math.min(widthRatio, heightRatio, 1); // 不超过原始尺寸

    // 强制设置初始缩放，确保图片完整显示且周围至少保留20%黑边
    // 重置 currentScale 为计算出的最大比率
    currentScale = maxRatio;

    // 重置平移，因为缩放改变了
    currentTranslateX = 0;
    currentTranslateY = 0;
  }

  // 限制平移范围
  function constrainTranslate() {
    if (!previewImage) return;

    // 等待图片加载完成后再计算尺寸
    if (!previewImage.complete || previewImage.naturalWidth === 0) {
      return;
    }

    const containerRect = previewContainer.getBoundingClientRect();

    // 获取图片的自然尺寸（原始尺寸）
    const naturalWidth = previewImage.naturalWidth;
    const naturalHeight = previewImage.naturalHeight;

    // 计算缩放后的实际显示尺寸（直接使用natural尺寸乘以currentScale）
    const scaledWidth = naturalWidth * currentScale;
    const scaledHeight = naturalHeight * currentScale;

    // 分别对X和Y方向进行约束判断
    // X方向约束
    if (scaledWidth <= containerRect.width) {
      // 图片宽度小于等于容器，允许自由拖拽
      const maxX = Math.max(200, containerRect.width);
      currentTranslateX = Math.max(-maxX, Math.min(maxX, currentTranslateX));
    } else {
      // 图片宽度大于容器，限制在边界内
      const maxX = (scaledWidth - containerRect.width) / 2;
      currentTranslateX = Math.max(-maxX, Math.min(maxX, currentTranslateX));
    }

    // Y方向约束
    if (scaledHeight <= containerRect.height) {
      // 图片高度小于等于容器，允许自由拖拽
      const maxY = Math.max(200, containerRect.height);
      currentTranslateY = Math.max(-maxY, Math.min(maxY, currentTranslateY));
    } else {
      // 图片高度大于容器，限制在边界内
      const maxY = (scaledHeight - containerRect.height) / 2;
      currentTranslateY = Math.max(-maxY, Math.min(maxY, currentTranslateY));
    }
  }

  // 鼠标滚轮缩放
  function handleWheel(e) {
    if (!isPreviewOpen) return;

    e.preventDefault();
    e.stopPropagation();

    const delta = e.deltaY;
    // 增大缩放速度，每次缩放约10%，更快响应
    const zoomFactor = delta > 0 ? 0.9 : 1.1;

    // 获取鼠标位置相对于图片的位置
    const rect = previewImage.getBoundingClientRect();
    const mouseX = e.clientX - rect.left - rect.width / 2;
    const mouseY = e.clientY - rect.top - rect.height / 2;

    const oldScale = currentScale;
    currentScale = constrainScale(currentScale * zoomFactor);

    // 以鼠标位置为中心缩放
    const scaleChange = currentScale / oldScale;
    const newTranslateX = mouseX * (1 - scaleChange) + currentTranslateX * scaleChange;
    const newTranslateY = mouseY * (1 - scaleChange) + currentTranslateY * scaleChange;

    currentTranslateX = newTranslateX;
    currentTranslateY = newTranslateY;

    constrainTranslate();
    updateTransform();
  }

  // 触摸开始
  function handleTouchStart(e) {
    if (!isPreviewOpen) return;

    if (e.touches.length === 2) {
      // 双指缩放
      isPinching = true;
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];

      touchStartDistance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      );
      touchStartScale = currentScale;

      touchStartCenterX = (touch1.clientX + touch2.clientX) / 2;
      touchStartCenterY = (touch1.clientY + touch2.clientY) / 2;

      e.preventDefault();
    } else if (e.touches.length === 1) {
      // 单指拖拽
      isDragging = true;
      const touch = e.touches[0];
      dragStartX = touch.clientX;
      dragStartY = touch.clientY;
      dragStartTranslateX = currentTranslateX;
      dragStartTranslateY = currentTranslateY;
    }
  }

  // 触摸移动
  function handleTouchMove(e) {
    if (!isPreviewOpen) return;

    if (e.touches.length === 2 && isPinching) {
      // 双指缩放
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];

      const currentDistance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      );

      const scaleChange = currentDistance / touchStartDistance;
      currentScale = constrainScale(touchStartScale * scaleChange);

      // 以双指中心为缩放中心
      const rect = previewImage.getBoundingClientRect();
      const centerX = (touch1.clientX + touch2.clientX) / 2;
      const centerY = (touch1.clientY + touch2.clientY) / 2;

      const imageCenterX = centerX - rect.left - rect.width / 2;
      const imageCenterY = centerY - rect.top - rect.height / 2;

      const scaleRatio = currentScale / touchStartScale;
      currentTranslateX =
        imageCenterX * (1 - scaleRatio) + dragStartTranslateX * scaleRatio;
      currentTranslateY =
        imageCenterY * (1 - scaleRatio) + dragStartTranslateY * scaleRatio;

      constrainTranslate();
      updateTransform();
      e.preventDefault();
    } else if (e.touches.length === 1 && isDragging) {
      // 单指拖拽
      const touch = e.touches[0];
      const deltaX = touch.clientX - dragStartX;
      const deltaY = touch.clientY - dragStartY;

      currentTranslateX = dragStartTranslateX + deltaX;
      currentTranslateY = dragStartTranslateY + deltaY;

      constrainTranslate();
      updateTransform();
      e.preventDefault();
    }
  }

  // 触摸结束
  function handleTouchEnd(e) {
    if (e.touches.length < 2) {
      isPinching = false;
    }
    if (e.touches.length === 0) {
      isDragging = false;
    }
  }

  // 鼠标按下
  function handleMouseDown(e) {
    if (!isPreviewOpen || e.button !== 0) return; // 只处理左键

    // 点击图片或容器都可以拖拽（但点击容器背景会关闭预览，所以主要是在图片上拖拽）
    if (e.target === previewImage || e.target === previewContainer) {
      // 如果点击的是容器背景，不拖拽（会触发关闭）
      if (e.target === previewContainer) {
        return;
      }

      isDragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      dragStartTranslateX = currentTranslateX;
      dragStartTranslateY = currentTranslateY;
      
      previewContainer.style.cursor = 'grabbing';
      previewImage.style.transition = 'none'; // 拖拽时禁用过渡，更流畅
      e.preventDefault();
    }
  }

  // 鼠标移动
  function handleMouseMove(e) {
    if (!isPreviewOpen) return;

    // 如果正在拖拽，更新位置
    if (isDragging) {
      const deltaX = e.clientX - dragStartX;
      const deltaY = e.clientY - dragStartY;

      currentTranslateX = dragStartTranslateX + deltaX;
      currentTranslateY = dragStartTranslateY + deltaY;

      constrainTranslate();
      updateTransform();
    } else {
      // 未拖拽时，根据鼠标位置更新光标样式
      if (e.target === previewImage) {
        previewContainer.style.cursor = 'grab';
      }
    }
  }

  // 鼠标释放
  function handleMouseUp(e) {
    if (isDragging) {
      isDragging = false;
      previewContainer.style.cursor = 'grab';
      // 恢复过渡效果
      if (previewImage) {
        previewImage.style.transition = 'transform 0.1s ease-out';
      }
    }
  }

  // 监听图片点击事件
  document.addEventListener(
    'click',
    function (e) {
      // Alt + 左键点击
      if (e.altKey && e.button === 0) {
        let target = e.target;

        // 查找图片元素
        while (target && target !== document.body) {
          if (target.tagName === 'IMG') {
            const imgSrc =
              target.src ||
              target.getAttribute('data-src') ||
              target.getAttribute('data-lazy-src');
            if (imgSrc) {
              e.preventDefault();
              e.stopPropagation();
              openPreview(imgSrc, target);
              return;
            }
          }
          target = target.parentElement;
        }
      }
    },
    true
  );

  // 初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createPreviewContainer);
  } else {
    createPreviewContainer();
  }
})();
