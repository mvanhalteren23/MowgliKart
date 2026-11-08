// Addressables stand-in: every operation is already complete, results configurable, calls recorded.
using System;
using System.Collections;
using System.Collections.Generic;

namespace UnityEngine.ResourceManagement.ResourceProviders { public class SceneInstance { public string Key; } }
namespace UnityEngine.ResourceManagement.AsyncOperations
{
    public enum AsyncOperationStatus { None, Succeeded, Failed }
    public struct AsyncOperationHandle<T> : IEnumerator
    {
        public bool IsDone; public AsyncOperationStatus Status; public Exception OperationException; public bool Valid;
        public bool IsValid() { return Valid; }
        // Real Addressables invokes a handler added to an already-completed handle immediately.
        public event Action<AsyncOperationHandle<T>> Completed { add { value(this); } remove { } }
        public bool MoveNext() { return false; } public void Reset() { } public object Current { get { return null; } }
    }
}
namespace UnityEngine.AddressableAssets.ResourceLocators { public interface IResourceLocator { } }
namespace UnityEngine.AddressableAssets
{
    using UnityEngine.ResourceManagement.AsyncOperations;
    using UnityEngine.ResourceManagement.ResourceProviders;
    using UnityEngine.AddressableAssets.ResourceLocators;
    using UnityEngine.SceneManagement;

    public static class Addressables
    {
        public static List<string> CatalogUrls = new List<string>(), SceneLoads = new List<string>(), Events = new List<string>();
        public static HashSet<string> FailCatalogs = new HashSet<string>(), FailScenes = new HashSet<string>();
        public static void Reset() { CatalogUrls.Clear(); SceneLoads.Clear(); Events.Clear(); FailCatalogs.Clear(); FailScenes.Clear(); }

        public static AsyncOperationHandle<IResourceLocator> LoadContentCatalogAsync(string path, bool autoReleaseHandle = false)
        {
            CatalogUrls.Add(path);
            bool ok = !FailCatalogs.Contains(path);
            return new AsyncOperationHandle<IResourceLocator> { IsDone = true, Valid = true, Status = ok ? AsyncOperationStatus.Succeeded : AsyncOperationStatus.Failed };
        }
        public static AsyncOperationHandle<SceneInstance> LoadSceneAsync(object key, LoadSceneMode loadMode = LoadSceneMode.Single, bool activateOnLoad = true, int priority = 100)
        {
            string k = (string)key; SceneLoads.Add(k);
            bool ok = !FailScenes.Contains(k);
            return new AsyncOperationHandle<SceneInstance> { IsDone = true, Valid = true, Status = ok ? AsyncOperationStatus.Succeeded : AsyncOperationStatus.Failed,
                OperationException = ok ? null : new Exception("scene not found: " + k) };
        }
        public static AsyncOperationHandle<SceneInstance> UnloadSceneAsync(AsyncOperationHandle<SceneInstance> h, bool autoReleaseHandle = true)
        { Events.Add("UnloadScene"); return new AsyncOperationHandle<SceneInstance> { IsDone = true, Valid = false, Status = AsyncOperationStatus.Succeeded }; }
        public static void Release(AsyncOperationHandle<SceneInstance> h) { Events.Add("Release"); }
    }
}
