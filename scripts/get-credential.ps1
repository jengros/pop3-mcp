param([Parameter(Mandatory = $true)][ValidateLength(1, 256)][string]$Target)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
namespace ReadonlyPop3Mcp {
    public static class CredentialReader {
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct CREDENTIAL {
            public UInt32 Flags; public UInt32 Type; public string TargetName; public string Comment;
            public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
            public UInt32 CredentialBlobSize; public IntPtr CredentialBlob; public UInt32 Persist;
            public UInt32 AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName;
        }
        [DllImport("advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool CredRead(string target, UInt32 type, UInt32 flags, out IntPtr credential);
        [DllImport("advapi32.dll", SetLastError = true)] private static extern void CredFree(IntPtr buffer);
        public static string Read(string target) {
            IntPtr pointer;
            if (!CredRead(target, 1, 0, out pointer)) throw new Win32Exception(Marshal.GetLastWin32Error());
            try {
                CREDENTIAL credential = (CREDENTIAL)Marshal.PtrToStructure(pointer, typeof(CREDENTIAL));
                if (credential.CredentialBlob == IntPtr.Zero || credential.CredentialBlobSize == 0) return string.Empty;
                return Marshal.PtrToStringUni(credential.CredentialBlob, (int)credential.CredentialBlobSize / 2);
            } finally { CredFree(pointer); }
        }
    }
}
'@
$secret = [ReadonlyPop3Mcp.CredentialReader]::Read($Target)
[Console]::Out.Write($secret)


