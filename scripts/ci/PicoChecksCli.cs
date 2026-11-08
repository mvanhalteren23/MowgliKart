using System;
using System.Linq;
using LegacyVR.KartRacing.EditorTools.Checks;

// Runs the Pico pre-flight checks without Unity (mono/dotnet). Usage: PicoChecksCli.exe <projectRoot>
// Exit code 1 when any Error is found.
internal static class PicoChecksCli
{
    private static int Main(string[] args)
    {
        string root = args.Length > 0 ? args[0] : ".";
        var issues = PicoProjectChecks.Run(root);

        foreach (Issue issue in issues)
        {
            Console.WriteLine(issue);
        }

        Console.WriteLine($"Pico checks: {issues.Count(i => i.Severity == Severity.Error)} error(s), {issues.Count(i => i.Severity == Severity.Warning)} warning(s)");
        return PicoProjectChecks.HasErrors(issues) ? 1 : 0;
    }
}
