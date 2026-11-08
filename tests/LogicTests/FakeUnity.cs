// In-memory stand-in for the parts of UnityEngine the project scripts use. Behavioural, not just signatures:
// object lifetime (== null after Destroy), component lookup, Instantiate, a coroutine scheduler with fake time,
// real quaternion math. Test-only; never part of the Unity build.
using System;
using System.Collections;
using System.Collections.Generic;

namespace UnityEngine
{
    [Flags] public enum HideFlags { None = 0, HideInHierarchy = 1 }

    public class Object
    {
        public string name;
        public HideFlags hideFlags;
        internal bool destroyed;

        public static bool operator ==(Object a, Object b)
        {
            bool an = ReferenceEquals(a, null) || a.destroyed;
            bool bn = ReferenceEquals(b, null) || b.destroyed;
            if (an || bn) return an && bn;
            return ReferenceEquals(a, b);
        }
        public static bool operator !=(Object a, Object b) { return !(a == b); }
        public override bool Equals(object o) { return o is Object && this == (Object)o; }
        public override int GetHashCode() { return base.GetHashCode(); }
        public static implicit operator bool(Object o) { return !ReferenceEquals(o, null) && !o.destroyed; }

        public static void Destroy(Object o)
        {
            if (ReferenceEquals(o, null)) return;
            o.destroyed = true;
            var go = o as GameObject;
            if (go != null) foreach (Component c in go.components) c.destroyed = true;
        }
        public static void DontDestroyOnLoad(Object o) { Sim.DontDestroyCalls++; }
        public static T Instantiate<T>(T o) where T : Object { return (T)(Object)((GameObject)(Object)o).Clone(); }
        public static T Instantiate<T>(T o, Vector3 p, Quaternion r) where T : Object
        {
            GameObject g = ((GameObject)(Object)o).Clone(); g.transform.position = p; g.transform.rotation = r; return (T)(Object)g;
        }
        public static T FindObjectOfType<T>() where T : Object
        {
            foreach (GameObject g in GameObject.All.ToArray())
            {
                if (g.destroyed || !g.activeSelf) continue;
                foreach (Component c in g.components) if (!c.destroyed && c is T) return (T)(Object)c;
            }
            return null;
        }
        public static T[] FindObjectsOfType<T>(bool includeInactive) where T : Object
        {
            var list = new List<T>();
            foreach (GameObject g in GameObject.All.ToArray())
            {
                if (g.destroyed || (!includeInactive && !g.activeSelf)) continue;
                foreach (Component c in g.components) if (!c.destroyed && c is T) list.Add((T)(Object)c);
            }
            return list.ToArray();
        }
    }

    public class Component : Object
    {
        public GameObject gameObject; public Transform transform;
        public T GetComponent<T>() { return gameObject == null ? default(T) : gameObject.GetComponent<T>(); }
        public bool CompareTag(string t) { return gameObject.tag == t; }
    }
    public class Behaviour : Component { public bool enabled = true; }

    public class MonoBehaviour : Behaviour
    {
        public Coroutine StartCoroutine(IEnumerator e) { return Sim.StartCoroutine(this, e); }
    }
    public class Coroutine { }

    public class GameObject : Object
    {
        public static List<GameObject> All = new List<GameObject>();
        public List<Component> components = new List<Component>();
        public string tag = "Untagged"; public int layer; public bool activeSelf = true;
        public Transform transform;

        public GameObject() { Init(); }
        public GameObject(string n) { name = n; Init(); }
        public GameObject(string n, params Type[] types) { name = n; Init(); foreach (Type t in types) AddComponentOfType(t, null); }
        private void Init() { transform = new Transform(); transform.gameObject = this; transform.transform = transform; components.Add(transform); All.Add(this); }

        public void SetActive(bool b) { activeSelf = b; }

        public T AddComponent<T>() where T : Component { return (T)AddComponentOfType(typeof(T), null); }
        /// <summary>Test helper: sets serialized fields BEFORE Awake runs, like a prefab does in Unity.</summary>
        public T AddComponentWith<T>(Action<T> configure) where T : Component
        {
            return (T)AddComponentOfType(typeof(T), c => configure((T)c));
        }
        private Component AddComponentOfType(Type t, Action<Component> configure)
        {
            var c = (Component)Activator.CreateInstance(t, true);
            c.gameObject = this; c.transform = transform; c.name = name;
            components.Add(c);
            if (configure != null) configure(c);
            Sim.CallPrivate(c, "Awake");
            return c;
        }
        public T GetComponent<T>()
        {
            foreach (Component c in components) if (!c.destroyed && c is T) return (T)(object)c;
            return default(T);
        }
        /// <summary>Prefab clone: same component types, fresh instances (serialized values are not copied).</summary>
        public GameObject Clone()
        {
            var g = new GameObject(name);
            g.tag = tag; g.layer = layer;
            foreach (Component c in components)
            {
                if (c is Transform) continue;
                g.AddComponentOfType(c.GetType(), null);
            }
            return g;
        }
        public static GameObject CreatePrimitive(PrimitiveType t) { return new GameObject("Primitive"); }
    }

    public enum PrimitiveType { Cube }

    public class Transform : Component
    {
        public Vector3 position;
        public Quaternion rotation = Quaternion.identity;
        public Quaternion localRotation = Quaternion.identity;
        public Vector3 localEulerAngles;
        public Transform parent;
        public Vector3 forward { get { return rotation * Vector3.forward; } }
        public Vector3 right { get { return rotation * Vector3.right; } }
        public void SetParent(Transform p, bool w) { parent = p; }
        public void Rotate(float x, float y, float z, Space s) { rotation = rotation * Quaternion.Euler(x, y, z); }
    }
    public class RectTransform : Transform { }
    public enum Space { World, Self }

    // ------------------------------------------------------------------ math (real)
    public struct Vector2 { public float x, y; public Vector2(float x, float y) { this.x = x; this.y = y; } public static Vector2 zero; }
    public struct Vector3
    {
        public float x, y, z;
        public Vector3(float x, float y, float z) { this.x = x; this.y = y; this.z = z; }
        public static Vector3 zero = new Vector3(0, 0, 0), up = new Vector3(0, 1, 0), down = new Vector3(0, -1, 0),
            forward = new Vector3(0, 0, 1), right = new Vector3(1, 0, 0);
        public float sqrMagnitude { get { return x * x + y * y + z * z; } }
        public float magnitude { get { return (float)Math.Sqrt(sqrMagnitude); } }
        public void Normalize() { float m = magnitude; if (m > 1e-6f) { x /= m; y /= m; z /= m; } }
        public static Vector3 MoveTowards(Vector3 a, Vector3 b, float d)
        {
            Vector3 diff = b - a; float m = diff.magnitude; if (m <= d || m < 1e-6f) return b; return a + diff * (d / m);
        }
        public static Vector3 operator +(Vector3 a, Vector3 b) { return new Vector3(a.x + b.x, a.y + b.y, a.z + b.z); }
        public static Vector3 operator -(Vector3 a, Vector3 b) { return new Vector3(a.x - b.x, a.y - b.y, a.z - b.z); }
        public static Vector3 operator *(Vector3 a, float s) { return new Vector3(a.x * s, a.y * s, a.z * s); }
        public static Vector3 operator *(float s, Vector3 a) { return a * s; }
        public static Vector3 operator -(Vector3 a) { return new Vector3(-a.x, -a.y, -a.z); }
    }
    public struct Quaternion
    {
        public float x, y, z, w;
        public Quaternion(float x, float y, float z, float w) { this.x = x; this.y = y; this.z = z; this.w = w; }
        public static Quaternion identity = new Quaternion(0, 0, 0, 1);
        public static Quaternion Euler(float xd, float yd, float zd)
        {
            // Unity order: Z, then X, then Y  =>  q = qY * qX * qZ
            Quaternion qx = Axis(1, 0, 0, xd), qy = Axis(0, 1, 0, yd), qz = Axis(0, 0, 1, zd);
            return qy * qx * qz;
        }
        private static Quaternion Axis(float ax, float ay, float az, float deg)
        {
            double h = deg * Math.PI / 360.0; float s = (float)Math.Sin(h);
            return new Quaternion(ax * s, ay * s, az * s, (float)Math.Cos(h));
        }
        public static Quaternion operator *(Quaternion a, Quaternion b)
        {
            return new Quaternion(
                a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
                a.w * b.y + a.y * b.w + a.z * b.x - a.x * b.z,
                a.w * b.z + a.z * b.w + a.x * b.y - a.y * b.x,
                a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z);
        }
        public static Vector3 operator *(Quaternion q, Vector3 v)
        {
            Vector3 u = new Vector3(q.x, q.y, q.z); float s = q.w;
            Vector3 cross1 = Cross(u, v);
            Vector3 cross2 = Cross(u, cross1);
            return v + (cross1 * s + cross2) * 2f;
        }
        private static Vector3 Cross(Vector3 a, Vector3 b)
        { return new Vector3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x); }
    }
    public struct Matrix4x4 { public static Matrix4x4 Scale(Vector3 v) { return default(Matrix4x4); } }
    public struct Rect { public Rect(float x, float y, float w, float h) { } }
    public struct RaycastHit { public Vector3 point; }
    public struct LayerMask { public static implicit operator LayerMask(int i) { return default(LayerMask); } public static implicit operator int(LayerMask m) { return 0; } }

    public static class Mathf
    {
        public const float Rad2Deg = 57.29578f;
        public static float Clamp01(float v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
        public static float Clamp(float v, float a, float b) { return v < a ? a : (v > b ? b : v); }
        public static int Clamp(int v, int a, int b) { return v < a ? a : (v > b ? b : v); }
        public static float Abs(float v) { return v < 0 ? -v : v; }
        public static float Atan2(float a, float b) { return (float)Math.Atan2(a, b); }
        public static float Asin(float a) { return (float)Math.Asin(a); }
        public static float Exp(float a) { return (float)Math.Exp(a); }
        public static float DeltaAngle(float cur, float target)
        { float d = (target - cur) % 360f; if (d > 180f) d -= 360f; if (d < -180f) d += 360f; return d; }
        public static float LerpAngle(float a, float b, float t) { return a + DeltaAngle(a, b) * Clamp01(t); }
        public static float MoveTowards(float a, float b, float d) { return Abs(b - a) <= d ? b : a + Math.Sign(b - a) * d; }
        public static int RoundToInt(float f) { return (int)Math.Round(f); }
        public static float Min(float a, float b) { return a < b ? a : b; }
        public static int Min(int a, int b) { return a < b ? a : b; }
        public static int Max(int a, int b) { return a > b ? a : b; }
    }

    // ------------------------------------------------------------------ engine statics
    public static class Time
    {
        public static float deltaTime = 0.1f, unscaledDeltaTime = 0.1f, unscaledTime;
        public static double realtimeSinceStartupAsDouble;
    }
    public static class Debug
    {
        public static List<string> Logs = new List<string>(), Warnings = new List<string>(), Errors = new List<string>();
        public static void Log(object o) { Logs.Add(Convert.ToString(o)); }
        public static void LogWarning(object o) { Warnings.Add(Convert.ToString(o)); }
        public static void LogError(object o) { Errors.Add(Convert.ToString(o)); }
        public static void Assert(bool b) { }
    }
    public enum ThreadPriority { Low, BelowNormal, Normal, High }
    public static class Application
    {
        public static string identifier = "com.legacyvr.kartclient";
        public static ThreadPriority backgroundLoadingPriority = ThreadPriority.BelowNormal;
        public static bool runInBackground; public static int targetFrameRate;
        public static List<string> OpenedUrls = new List<string>();
        public static void OpenURL(string u) { OpenedUrls.Add(u); }
    }
    public static class QualitySettings { public static int vSyncCount; }
    public static class SleepTimeout { public const int NeverSleep = -1; }
    public static class Screen { public static int sleepTimeout; public static int height = 800; }
    public static class SystemInfo
    {
        public static string deviceUniqueIdentifier = "DEVICE-UID"; public static float batteryLevel = 0.8f; public static string deviceModel = "Pico G2";
    }
    public enum KeyCode { R, Space, JoystickButton0, UpArrow, DownArrow, Return }
    public static class Input
    {
        public static HashSet<KeyCode> Down = new HashSet<KeyCode>();
        public static bool GetKeyDown(KeyCode k) { return Down.Contains(k); }
        public static bool GetKey(KeyCode k) { return Down.Contains(k); }
        public static float GetAxisRaw(string a) { return 0; }
    }
    public class AsyncOperation : IEnumerator
    {
        public bool isDone = true;
        public bool MoveNext() { return !isDone; } public void Reset() { } public object Current { get { return null; } }
    }
    public static class Resources
    {
        public static int UnloadUnusedAssetsCalls;
        public static AsyncOperation UnloadUnusedAssets() { UnloadUnusedAssetsCalls++; return new AsyncOperation(); }
    }
    public enum RigidbodyInterpolation { None }
    public enum CollisionDetectionMode { Discrete }
    public class Rigidbody : Component { public bool isKinematic, useGravity; public RigidbodyInterpolation interpolation; public CollisionDetectionMode collisionDetectionMode; }
    public class Collider : Component { public bool isTrigger; }
    public class BoxCollider : Collider { }
    public enum QueryTriggerInteraction { Ignore }
    public static class Physics
    {
        public static bool autoSimulation;
        public static bool Raycast(Vector3 o, Vector3 d, out RaycastHit h, float m, int l, QueryTriggerInteraction q) { h = default(RaycastHit); return false; }
        public static void Simulate(float s) { }
    }
    public class Canvas : Behaviour { }
    public class TextMesh : Component { public string text; }
    public enum RuntimeInitializeLoadType { AfterSceneLoad }
    public class RuntimeInitializeOnLoadMethodAttribute : Attribute { public RuntimeInitializeOnLoadMethodAttribute(RuntimeInitializeLoadType t) { } }
    public class HeaderAttribute : Attribute { public HeaderAttribute(string s) { } }
    public class TooltipAttribute : Attribute { public TooltipAttribute(string s) { } }
    public class SerializeFieldAttribute : Attribute { }
    public class RangeAttribute : Attribute { public RangeAttribute(float a, float b) { } }
    [AttributeUsage(AttributeTargets.Class, AllowMultiple = true)] public class RequireComponent : Attribute { public RequireComponent(Type t) { } }
    public class DefaultExecutionOrderAttribute : Attribute { public DefaultExecutionOrderAttribute(int o) { } }

    // ------------------------------------------------------------------ yield instructions
    public abstract class CustomYieldInstruction : IEnumerator
    {
        public bool MoveNext() { return false; } public void Reset() { } public object Current { get { return null; } }
    }
    public class WaitForSecondsRealtime : CustomYieldInstruction
    {
        public float seconds; public WaitForSecondsRealtime(float s) { seconds = s; }
    }

    // ------------------------------------------------------------------ IMGUI (clickable by label for operator-panel tests)
    public class GUIStyle { }
    public class GUISkin { public GUIStyle box = new GUIStyle(); }
    public class GUILayoutOption { }
    public static class GUI { public static Matrix4x4 matrix; public static bool enabled = true; public static GUISkin skin = new GUISkin(); }
    public static class GUILayout
    {
        public static List<string> Labels = new List<string>();
        public static HashSet<string> Clicks = new HashSet<string>();     // button labels to "press" during the next OnGUI
        public static List<string> ButtonsSeen = new List<string>();
        public static void Label(string s, params GUILayoutOption[] o) { Labels.Add(s); }
        public static bool Button(string s, params GUILayoutOption[] o)
        {
            ButtonsSeen.Add(s + (GUI.enabled ? "" : " [disabled]"));
            return GUI.enabled && Clicks.Remove(s);
        }
        public static bool Toggle(bool v, string s, params GUILayoutOption[] o) { return v; }
        public static string TextField(string s, params GUILayoutOption[] o) { return s; }
        public static int SelectionGrid(int sel, string[] t, int x) { return sel; }
        public static Vector2 BeginScrollView(Vector2 p, params GUILayoutOption[] o) { return p; }
        public static void EndScrollView() { }
        public static void BeginHorizontal() { } public static void EndHorizontal() { }
        public static void BeginArea(Rect r, GUIStyle s) { } public static void EndArea() { }
        public static void FlexibleSpace() { } public static void Space(float f) { }
        public static GUILayoutOption Width(float w) { return null; } public static GUILayoutOption Height(float h) { return null; }
    }
}

namespace UnityEngine.SceneManagement
{
    public enum LoadSceneMode { Single, Additive }
    public static class SceneManager
    {
        public static int sceneCount = 2;
        public static List<string> LoadedByName = new List<string>();
        public static UnityEngine.AsyncOperation LoadSceneAsync(string n, LoadSceneMode m) { LoadedByName.Add(n); return new UnityEngine.AsyncOperation(); }
        public static void LoadScene(string n, LoadSceneMode m) { LoadedByName.Add(n); }
    }
}
namespace UnityEngine.Events
{
    public class UnityEvent<T>
    {
        private readonly List<Action<T>> _l = new List<Action<T>>();
        public void AddListener(Action<T> a) { _l.Add(a); } public void RemoveListener(Action<T> a) { _l.Remove(a); }
        public void Invoke(T v) { foreach (Action<T> a in _l.ToArray()) a(v); }
    }
}

namespace UnityEngine
{
    /// <summary>Cooperative scheduler + fake clock. Test code advances time with Sim.Pump(seconds).</summary>
    public static class Sim
    {
        public static int DontDestroyCalls;
        public static double Now;
        private class Routine { public MonoBehaviour Owner; public IEnumerator E; public double WakeAt; public AsyncOperation Waiting; public bool Done; }
        private static readonly List<Routine> Routines = new List<Routine>();

        /// <summary>Hook so the Mirror fake can set "which headset is executing" while a coroutine runs.</summary>
        public static Action<MonoBehaviour> EnterContext = delegate { };
        public static Action ExitContext = delegate { };

        public static void Reset()
        {
            GameObject.All.Clear(); Routines.Clear(); Now = 0; DontDestroyCalls = 0;
            Time.realtimeSinceStartupAsDouble = 0; Time.unscaledTime = 0;
            Debug.Logs.Clear(); Debug.Warnings.Clear(); Debug.Errors.Clear();
            Input.Down.Clear(); SceneManager_Reset();
            Application.backgroundLoadingPriority = ThreadPriority.BelowNormal;
            Resources.UnloadUnusedAssetsCalls = 0; GUILayout.Labels.Clear(); GUILayout.Clicks.Clear(); GUILayout.ButtonsSeen.Clear();
            Application.OpenedUrls.Clear();
        }
        private static void SceneManager_Reset() { UnityEngine.SceneManagement.SceneManager.LoadedByName.Clear(); UnityEngine.SceneManagement.SceneManager.sceneCount = 2; }

        public static Coroutine StartCoroutine(MonoBehaviour owner, IEnumerator e)
        {
            var r = new Routine { Owner = owner, E = e, WakeAt = Now };
            Routines.Add(r);
            Step(r); // Unity runs the first segment immediately
            return new Coroutine();
        }

        public static void Pump(double seconds, double dt = 0.1)
        {
            double end = Now + seconds;
            while (Now < end - 1e-9)
            {
                Now += dt; Time.realtimeSinceStartupAsDouble = Now; Time.unscaledTime = (float)Now;
                foreach (Routine r in Routines.ToArray()) { if (!r.Done && r.WakeAt <= Now + 1e-9) Step(r); }
                Routines.RemoveAll(r => r.Done);
            }
        }

        private static void Step(Routine r)
        {
            if (r.Owner.destroyed) { r.Done = true; return; }
            if (r.Waiting != null && !r.Waiting.isDone) return;
            r.Waiting = null;

            EnterContext(r.Owner);
            try
            {
                if (!r.E.MoveNext()) { r.Done = true; return; }
            }
            finally { ExitContext(); }

            object y = r.E.Current;
            var wait = y as WaitForSecondsRealtime;
            if (wait != null) r.WakeAt = Now + wait.seconds;
            else { r.Waiting = y as AsyncOperation; r.WakeAt = Now; }
        }

        /// <summary>Unity calls private Awake/Start by reflection; so does the test world.</summary>
        public static void CallPrivate(object o, string method)
        {
            var m = o.GetType().GetMethod(method, System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.NonPublic);
            if (m == null || m.ReturnType != typeof(void)) return;
            m.Invoke(o, null);
        }
        /// <summary>Start() declared as an iterator (IEnumerator Start) is started as a coroutine, like Unity does.</summary>
        public static void RunStart(MonoBehaviour b)
        {
            var m = b.GetType().GetMethod("Start", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.NonPublic);
            if (m == null) return;
            object result;
            try { result = m.Invoke(b, null); } catch (System.Reflection.TargetInvocationException e) { throw e.InnerException; }
            var en = result as IEnumerator;
            if (en != null) StartCoroutine(b, en);
        }
    }
}
