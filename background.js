let currentTabId = null;
let isRunning = false;
const ALARM_NAME = 'tabSwitchAlarm';

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
      console.log('自动切换已禁用，跳过切换');
      return;
    }

    // 获取有效标签页
    const validTabs = await getValidTabs();
    if (validTabs.length === 0) {
      console.log('没有有效的标签页');
      return;
    }

    // 根据配置过滤标签页
    const filteredTabs = filterTabsBySettings(validTabs, settings);
    if (filteredTabs.length === 0) {
      console.log('所有标签页都被过滤掉了');
      return;
    }

    console.log(`当前标签ID: ${currentTabId}, 可切换标签页数量: ${filteredTabs.length}`);

    // 找到下一个要切换的标签页
    const targetTab = findNextTab(filteredTabs);
    if (!targetTab) {
      console.log('找不到下一个标签页');
      return;
    }

    // 验证标签页是否仍然存在
    try {
      await chrome.tabs.get(targetTab.id);
    } catch (error) {
      console.log(`标签页 ${targetTab.id} 不存在，重置currentTabId`);
      currentTabId = null;
      return;
    }

    console.log(`切换到标签页: ${targetTab.id} (${targetTab.url})`);

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
        console.log(`刷新标签页: ${targetTab.id}`);
        await chrome.tabs.reload(targetTab.id);
      } else {
        console.log(`跳过刷新标签页: ${targetTab.id} (在不刷新列表中)`);
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

  // 立即执行第一次切换
  await switchToNextTab();

  // 创建alarm进行后续切换
  await createSwitchAlarm(settings.stayTime);
}

// 创建切换alarm
async function createSwitchAlarm(stayTimeSeconds) {
  try {
    // 清除现有的alarm
    await chrome.alarms.clear(ALARM_NAME);

    // 对于短间隔，使用setTimeout更精确
    if (stayTimeSeconds <= 30) {
      console.log(`使用setTimeout，间隔: ${stayTimeSeconds}秒`);
      scheduleWithTimeout(stayTimeSeconds);
      return;
    }

    // 对于长间隔，使用alarm
    const delayInMinutes = stayTimeSeconds / 60;

    await chrome.alarms.create(ALARM_NAME, {
      delayInMinutes: delayInMinutes,
      periodInMinutes: delayInMinutes
    });

    console.log(`创建alarm，间隔: ${stayTimeSeconds}秒 (${delayInMinutes}分钟)`);
  } catch (error) {
    console.error('创建alarm失败:', error);
    // 回退到setTimeout
    scheduleWithTimeout(stayTimeSeconds);
  }
}

// 使用setTimeout的调度函数
function scheduleWithTimeout(stayTimeSeconds) {
  setTimeout(async () => {
    if (!isRunning) {
      return;
    }

    try {
      const settings = await loadSettings();
      if (!settings.enableSwitching) {
        await stopSwitching();
        return;
      }

      await switchToNextTab();

      // 继续调度下一次
      scheduleWithTimeout(settings.stayTime);
    } catch (error) {
      console.error('setTimeout调度错误:', error);
      // 重试
      if (isRunning) {
        scheduleWithTimeout(Math.min(stayTimeSeconds, 5)); // 最多5秒后重试
      }
    }
  }, stayTimeSeconds * 1000);
}

// 停止切换定时器
async function stopSwitching() {
  console.log('停止标签页切换');
  isRunning = false;

  // 清除alarm
  try {
    await chrome.alarms.clear(ALARM_NAME);
    console.log('已清除切换alarm');
  } catch (error) {
    console.error('清除alarm失败:', error);
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

// 监听alarm事件
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) {
    try {
      // 检查配置是否仍然启用
      const settings = await loadSettings();
      if (!settings.enableSwitching) {
        await stopSwitching();
        return;
      }

      // 确保isRunning状态正确（Service Worker重启后可能丢失状态）
      isRunning = true;

      console.log('Alarm触发，执行标签页切换');
      await switchToNextTab();

    } catch (error) {
      console.error('Alarm触发时发生错误:', error);
      // 重置状态以便下次重试
      currentTabId = null;
    }
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