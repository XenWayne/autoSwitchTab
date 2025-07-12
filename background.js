let currentTabId = null;
let isRunning = false;
let intervalId = null;

// 从存储中获取配置并应用
function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get({
      stayTime: 5,
      enableSwitching: false,
      shouldRefresh: true,
      noSwitchUrls: '',
      noRefreshUrls: ''
    }, (items) => {
      resolve(items);
    });
  });
}

// 获取有效的标签页列表
async function getValidTabs() {
  try {
    const tabs = await chrome.tabs.query({});

    // 过滤掉无效的标签页
    const validTabs = tabs.filter(tab => {
      return tab.url && tab.id && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://');
    });

    return validTabs;
  } catch (error) {
    console.error('获取标签页失败:', error);
    return [];
  }
}

// 根据配置过滤标签页
function filterTabsBySettings(tabs, settings) {
  const noSwitchUrls = settings.noSwitchUrls
    .split('\n')
    .map(url => url.trim())
    .filter(url => url.length > 0);

  const filteredTabs = tabs.filter(tab => {
    // 检查标签页URL是否包含任何不切换模式
    return !noSwitchUrls.some(pattern => tab.url.includes(pattern));
  });

  return filteredTabs;
}

// 找到下一个要切换的标签页
function findNextTab(filteredTabs) {
  if (filteredTabs.length === 0) {
    return null;
  }

  // 如果当前没有记录的标签ID，或者当前标签ID不在过滤列表中，从第一个开始
  let currentIndex = -1;
  if (currentTabId) {
    currentIndex = filteredTabs.findIndex(tab => tab.id === currentTabId);
  }

  // 计算下一个标签的索引
  const nextIndex = (currentIndex + 1) % filteredTabs.length;
  const nextTab = filteredTabs[nextIndex];

  return nextTab;
}

// 切换到下一个标签页
async function switchToNextTab() {
  try {
    const settings = await loadSettings();
    if (!settings.enableSwitching) {
      return;
    }

    // 获取有效标签页
    const validTabs = await getValidTabs();
    if (validTabs.length === 0) {
      return;
    }

    // 根据配置过滤标签页
    const filteredTabs = filterTabsBySettings(validTabs, settings);
    if (filteredTabs.length === 0) {
      return;
    }

    // 找到下一个要切换的标签页
    const targetTab = findNextTab(filteredTabs);
    if (!targetTab) {
      return;
    }

    // 验证标签页是否仍然存在
    try {
      await chrome.tabs.get(targetTab.id);
    } catch (error) {
      currentTabId = null;
      return;
    }

    // 激活标签页
    await chrome.tabs.update(targetTab.id, { active: true });
    currentTabId = targetTab.id;

    // 处理刷新逻辑
    if (settings.shouldRefresh) {
      const noRefreshUrls = settings.noRefreshUrls
        .split('\n')
        .map(url => url.trim())
        .filter(url => url.length > 0);

      const shouldRefresh = !noRefreshUrls.some(pattern => targetTab.url.includes(pattern));
      if (shouldRefresh) {
        await chrome.tabs.reload(targetTab.id);
      }
    }

  } catch (error) {
    console.error('切换标签页时发生错误:', error);
    // 重置状态以便下次重试
    currentTabId = null;
  }
}

// 启动切换定时器
async function startSwitching() {
  // 如果已经在运行，先停止
  if (isRunning) {
    stopSwitching();
  }

  const settings = await loadSettings();
  if (!settings.enableSwitching) {
    return;
  }

  isRunning = true;

  // 使用递归setTimeout确保时间间隔准确
  async function scheduleNextSwitch() {
    if (!isRunning) {
      return;
    }

    try {
      await switchToNextTab();

      // 重新获取最新配置（可能在运行过程中被修改）
      const currentSettings = await loadSettings();
      if (!currentSettings.enableSwitching) {
        stopSwitching();
        return;
      }

      // 设置下一次切换
      intervalId = setTimeout(scheduleNextSwitch, currentSettings.stayTime * 1000);

    } catch (error) {
      console.error('切换过程中发生错误:', error);

      // 即使出错也要继续运行，但增加重试延迟
      const retryDelay = Math.min((settings.stayTime || 5) * 1000, 10000); // 最多延迟10秒
      intervalId = setTimeout(scheduleNextSwitch, retryDelay);
    }
  }

  // 立即执行第一次切换
  scheduleNextSwitch();
}

// 停止切换定时器
function stopSwitching() {
  if (!isRunning) {
    return;
  }

  isRunning = false;

  if (intervalId) {
    clearTimeout(intervalId);
    intervalId = null;
  }

  // 重置当前标签ID
  currentTabId = null;
}

// 监听标签页关闭事件
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === currentTabId) {
    currentTabId = null;
  }
});

// 监听标签页更新事件
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // 如果当前标签页URL发生变化，重置标签ID以确保下次切换正确
  if (changeInfo.url && tabId === currentTabId) {
    currentTabId = null;
  }
});

// 监听存储变化，更新配置
chrome.storage.onChanged.addListener(async (changes) => {
  const newSettings = await loadSettings();

  if (newSettings.enableSwitching) {
    startSwitching(); // 配置变化时重启定时器，应用新设置
  } else {
    stopSwitching();
  }
});

// 初始化时检查配置状态
loadSettings().then(settings => {
  if (settings.enableSwitching) {
    startSwitching();
  }
}).catch(error => {
  console.error('初始化时加载配置失败:', error);
});